import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal.jsx';
import { Field, TextField, TextArea, SelectField, FieldRow } from '../components/Field.jsx';
import { useDb, useSelectors, normalizeContactLinks } from '../lib/db.jsx';
import { STAGES, CONTACT_RELATIONS } from '../lib/store.js';
import { canUseParseToday, recordParseUse, canUseToday, recordUse, recordTokenUse } from '../lib/store.js';
import { hasCriteria, checkHardFilters, summarizeFit } from '../lib/fit.js';
import { findWebsite, findOrg, withProtocol, displayUrl } from '../lib/website.js';
import { today } from '../lib/dates.js';
import FitVerdict from '../components/FitVerdict.jsx';
import InfoDot from '../components/InfoDot.jsx';
import ContactForm from './ContactForm.jsx';
import styles from './ApplicationForm.module.css';

const NEW_ORG = '__new__';

// What each Seniority / scope value (1–5) means — a rough, generic read of the
// role's level, independent of personal fit. Surfaced via the info tooltip.
const SENIORITY_SCALE = [
  ['1', 'Junior — entry-level, narrow scope'],
  ['2', 'Mid-level — solid individual contributor'],
  ['3', 'Senior — owns major projects or a small team'],
  ['4', 'Staff / Manager — multi-team or broad scope'],
  ['5', 'Principal / Director+ — org-wide leadership']
];

// Add/edit an application. Hosts the paste-a-JD flow and fit scoring.
// `app` is the record being edited, or null/undefined to create a new one.
export default function ApplicationForm({ app, onClose }) {
  const { db, add, upsert } = useDb();
  const { orgName } = useSelectors();
  const isEdit = !!app?.id;

  // Initial snapshot kept for dirty-tracking (so Save stays disabled until
  // something actually changes).
  const initialForm = useMemo(
    () => ({
      title: app?.title || '',
      orgId: app?.orgId || '',
      stage: app?.stage || STAGES[0],
      location: app?.location || '',
      link: app?.link || '',
      fitNotes: app?.fitNotes || '',
      userNotes: app?.userNotes || '',
      fitScore: app?.fitScore ?? '',
      // Typed links: [{ contactId, relation }]. Normalized so older records
      // (flat contactIds) load as untyped 'contact' links.
      contactLinks: normalizeContactLinks(app).map(l => ({
        contactId: l.contactId,
        relation: l.relation
      })),
      appliedDate: app?.appliedDate || '',
      salary: app?.salary || '',
      closeReason: app?.closeReason || ''
    }),
    [app]
  );
  const [form, setForm] = useState(initialForm);
  const [newOrgName, setNewOrgName] = useState('');
  // Contact dialog opened from the linked-contacts list:
  //   { mode: 'new' }                  — create + auto-link to this job
  //   { mode: 'edit', contact }        — view/edit an existing contact
  const [contactModal, setContactModal] = useState(null);

  // Fit scoring. Auto-runs after a JD is parsed, and can be triggered on demand
  // for any role. An existing verdict (from a prior session) is loaded so it
  // shows on open. `fitStatus`: idle | scoring | done | error | nocriteria | limit.
  const [fit, setFit] = useState(app?.fitVerdict || null);
  const [fitStatus, setFitStatus] = useState(app?.fitVerdict ? 'done' : 'idle');
  const [fitError, setFitError] = useState('');
  // The fit-relevant JD digest used for scoring. Seeded from the digest stored
  // on a saved app so re-scoring after a refresh uses the same input that
  // produced the saved verdict (reproducible), not a thin form-field rebuild.
  const [lastJd, setLastJd] = useState(app?.fitSource || '');
  // Only a verdict produced this session is re-persisted/logged on save; a
  // loaded one is left untouched (no duplicate timeline entries on a plain edit).
  const [scoredThisSession, setScoredThisSession] = useState(false);

  const profileHasCriteria = hasCriteria(db.profile);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  // The saved org currently selected (not "+ New…" or "— No org —"). Its
  // website is shown under the field; if it has none, we look one up and persist
  // it to the org so the link appears here and on the board card. De-duped.
  const selectedOrg =
    form.orgId && form.orgId !== NEW_ORG
      ? db.orgs.find(o => o.id === form.orgId) || null
      : null;
  useEffect(() => {
    if (!selectedOrg || (selectedOrg.website || '').trim()) return;
    let cancelled = false;
    findWebsite({
      name: selectedOrg.name,
      industry: selectedOrg.industry,
      location: selectedOrg.location
    }).then(site => {
      if (!cancelled && site) upsert('orgs', { id: selectedOrg.id, website: site });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedOrg?.id, selectedOrg?.website]);

  // Existing job with no org: infer the hiring company from the job's own text,
  // link it to a matching org (creating one if needed), and persist both the
  // job's org and the org's website. Runs once on open; de-duped by job id.
  useEffect(() => {
    if (!app?.id || form.orgId) return; // only saved jobs that lack an org
    let cancelled = false;
    findOrg({
      appId: app.id,
      title: form.title,
      link: form.link,
      location: form.location,
      notes: [form.fitNotes, form.userNotes].filter(Boolean).join('\n'),
      digest: lastJd
    }).then(result => {
      if (cancelled || !result) return;
      const { company, website } = result;
      const existing = db.orgs.find(
        o => o.name.trim().toLowerCase() === company.toLowerCase()
      );
      let orgId;
      if (existing) {
        orgId = existing.id;
        if (website && !(existing.website || '').trim())
          upsert('orgs', { id: existing.id, website });
      } else {
        orgId = add('orgs', { name: company, ...(website ? { website } : {}) }).id;
      }
      upsert('apps', { id: app.id, orgId }); // link the existing job
      set('orgId', orgId); // reflect it in the open form
    });
    return () => {
      cancelled = true;
    };
    // Run once for the job this form opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A score just finished. Reflect it in the panel, and for an ALREADY-SAVED
  // job persist the verdict immediately so closing the dialog (X, backdrop,
  // Cancel) can't discard a score that may have cost an AI call. A brand-new,
  // uncommitted job keeps draft semantics — its score commits with "Add job".
  // `scoredThisSession` still drives the submit-time Analysis timeline entry, so
  // history is logged once on save, not on every re-score.
  function finishScore(scored, source) {
    setFit(scored);
    setScoredThisSession(true);
    setFitStatus('done');
    if (app?.id) {
      upsert('apps', {
        id: app.id,
        fitVerdict: { ...scored, scoredAt: new Date().toISOString() },
        // Persist the scored input (the digest) so a later re-score reuses it.
        ...(source ? { fitSource: source } : {})
      });
    }
  }

  // Score a JD against the user's criteria. Hard filters are checked in the
  // browser first — a trip yields an instant verdict with no API call.
  async function runScoring({ jdText, salary, location }) {
    if (!jdText) return;
    setLastJd(jdText);
    setFit(null);
    setFitError('');

    if (!profileHasCriteria) {
      setFitStatus('nocriteria');
      return;
    }

    const hard = checkHardFilters(db.profile, { salary, jdText, location });
    if (hard) {
      finishScore(hard, jdText);
      return;
    }

    if (!canUseToday('score')) {
      setFitStatus('limit');
      return;
    }

    setFitStatus('scoring');
    try {
      const res = await fetch('/api/score-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdText, profile: db.profile })
      });
      const data = await res.json();
      if (!res.ok) {
        setFitStatus('error');
        setFitError(data.error || 'Could not score this job.');
        return;
      }
      recordUse('score');
      recordTokenUse('score', data._usage);
      finishScore(data, jdText);
    } catch {
      setFitStatus('error');
      setFitError('Network error while scoring.');
    }
  }

  // Score the role on demand from whatever we have: the JD parsed this session
  // if any, otherwise the role's own saved fields. The latter is a weaker basis
  // than a full JD (the reasoning will note it) — re-paste the posting for a
  // thorough read.
  function scoreCurrent() {
    const jdText = lastJd || roleTextFromForm();
    runScoring({ jdText, salary: form.salary, location: form.location });
  }

  function roleTextFromForm() {
    return [
      form.title && `Title: ${form.title}`,
      form.orgId && form.orgId !== NEW_ORG && `Company: ${orgName(form.orgId)}`,
      form.location && `Location: ${form.location}`,
      form.salary && `Compensation: ${form.salary}`,
      form.fitNotes
    ]
      .filter(Boolean)
      .join('\n');
  }

  // Something to score from: a parsed JD this session, or saved role detail.
  const canScore = !!(lastJd || form.title || form.fitNotes);

  // Dirty = any field changed, a new org typed, or a fresh score to persist.
  const isDirty =
    JSON.stringify(form) !== JSON.stringify(initialForm) ||
    scoredThisSession ||
    (form.orgId === NEW_ORG && newOrgName.trim() !== '');

  // Offer ALL contacts for linking — a referrer often doesn't work at the org
  // they referred you to (the whole point of the feature), so we must not
  // org-scope this. Contacts at the selected org are simply sorted to the top
  // for convenience.
  const linkedId = id => form.contactLinks.some(l => l.contactId === id);
  const atOrg = c => form.orgId && form.orgId !== NEW_ORG && c.orgId === form.orgId;
  const linkableContacts = [...db.contacts].sort(
    (a, b) => (atOrg(b) ? 1 : 0) - (atOrg(a) ? 1 : 0)
  );

  function toggleContact(id) {
    set(
      'contactLinks',
      linkedId(id)
        ? form.contactLinks.filter(l => l.contactId !== id)
        : [...form.contactLinks, { contactId: id, relation: 'contact' }]
    );
  }

  function setContactRelation(id, relation) {
    set(
      'contactLinks',
      form.contactLinks.map(l => (l.contactId === id ? { ...l, relation } : l))
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    let orgId = form.orgId;
    // Create a new org on the fly if one was named.
    if (orgId === NEW_ORG) {
      const name = newOrgName.trim();
      orgId = name ? add('orgs', { name }).id : '';
    }
    // A verdict scored THIS session is stamped and stored on the app itself
    // (the latest fit lives with the role); omitting it on a plain edit
    // preserves any existing verdict via the upsert merge, and avoids logging a
    // duplicate timeline entry every time the form is saved.
    const scored =
      scoredThisSession && fit ? { ...fit, scoredAt: new Date().toISOString() } : null;
    const record = {
      ...(app?.id ? { id: app.id } : {}),
      ...form,
      orgId,
      fitScore: form.fitScore === '' ? null : Number(form.fitScore),
      // Keep the flat contactIds in sync as a mirror of the typed links, so
      // readers that haven't migrated (share payload, exports) still resolve.
      contactIds: form.contactLinks.map(l => l.contactId),
      ...(scored ? { fitVerdict: scored } : {}),
      // Store the scored input (digest) only with a fresh verdict, so a plain
      // edit preserves any existing one via the upsert merge.
      ...(scored && lastJd ? { fitSource: lastJd } : {})
    };
    const saved = upsert('apps', record);

    // Also log it to the Analysis timeline (history), linked to the
    // (possibly just-created) app. Only a verdict scored this session writes one.
    if (scored) {
      add('analyses', {
        type: 'Fit scoring',
        title: `Fit: ${form.title || 'job'}`,
        appId: saved.id,
        orgId,
        body: summarizeFit(scored),
        fit: scored
      });
    }

    onClose();
  }

  return (
    <Modal
      title={
        isEdit
          ? [form.title || 'Untitled job', orgName(form.orgId)]
              .filter(Boolean)
              .join(' · ')
          : 'New job'
      }
      onClose={onClose}
      wide
      footer={
        <>
          {isEdit && <DeleteButton app={app} onClose={onClose} />}
          <button
            type="submit"
            form="application-form"
            className="btn btn--primary"
            disabled={fitStatus === 'scoring' || (isEdit && !isDirty)}
            title={fitStatus === 'scoring' ? 'Waiting for the fit score…' : undefined}
          >
            {fitStatus === 'scoring'
              ? 'Scoring…'
              : isEdit
                ? 'Save changes'
                : 'Add job'}
          </button>
        </>
      }
    >
      <PasteJdPanel
        userState={db.profile?.homeState}
        onParsed={(parsed, meta) => {
          applyParsed(parsed, { db, form, set, setNewOrgName, meta });
          if (meta.jdText) {
            runScoring({
              jdText: meta.jdText,
              salary: parsed.salary,
              location: parsed.location
            });
          }
        }}
      />

      <FitPanel
        status={fitStatus}
        fit={fit}
        error={fitError}
        hasCriteria={profileHasCriteria}
        canScore={canScore}
        onScore={scoreCurrent}
      />

      <form id="application-form" onSubmit={handleSubmit}>
        <TextField
          label="Job title"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Senior Product Manager"
          required
          autoFocus
        />

        <FieldRow>
          <Field label="Organization">
            <select value={form.orgId} onChange={e => set('orgId', e.target.value)}>
              <option value="">— No org —</option>
              {db.orgs.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
              <option value={NEW_ORG}>+ New organization…</option>
            </select>
            {selectedOrg?.website && (
              <a
                className={styles.orgUrl}
                href={withProtocol(selectedOrg.website)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {displayUrl(selectedOrg.website)}
              </a>
            )}
          </Field>
          <SelectField
            label="Stage"
            value={form.stage}
            onChange={e => {
              const stage = e.target.value;
              // Moving to "Applied" stamps today's date (date only), unless one
              // is already set — shown immediately in the Applied date field.
              setForm(f => ({
                ...f,
                stage,
                appliedDate:
                  stage === 'Applied' && !f.appliedDate ? today() : f.appliedDate
              }));
            }}
            options={STAGES}
          />
        </FieldRow>

        {form.orgId === NEW_ORG && (
          <TextField
            label="New organization name"
            value={newOrgName}
            onChange={e => setNewOrgName(e.target.value)}
            placeholder="Acme Corp"
          />
        )}

        {form.stage === 'Closed' && (
          <TextArea
            label="Reason for closing"
            value={form.closeReason}
            onChange={e => set('closeReason', e.target.value)}
            placeholder="Rejected, withdrew, position filled, lost interest…"
            rows={2}
          />
        )}

        <FieldRow>
          <TextField
            label="Location"
            value={form.location}
            onChange={e => set('location', e.target.value)}
            placeholder="Remote (US)"
          />
          <SelectField
            label={
              <>
                Seniority / scope (1–5)
                <InfoDot label="What the 1–5 scores mean">
                  <strong className={styles.scaleHead}>What the score means</strong>
                  <ul className={styles.scaleList}>
                    {SENIORITY_SCALE.map(([n, desc]) => (
                      <li key={n}>
                        <b>{n}</b> {desc}
                      </li>
                    ))}
                  </ul>
                </InfoDot>
              </>
            }
            value={String(form.fitScore)}
            onChange={e => set('fitScore', e.target.value)}
            options={['1', '2', '3', '4', '5']}
            placeholder="—"
          />
        </FieldRow>

        <FieldRow>
          <TextField
            label="Applied date"
            type="date"
            value={form.appliedDate}
            onChange={e => set('appliedDate', e.target.value)}
          />
          <TextField
            label="Salary / comp notes"
            value={form.salary}
            onChange={e => set('salary', e.target.value)}
            placeholder="$180–210k"
          />
        </FieldRow>

        <TextField
          label="Posting link"
          type="url"
          value={form.link}
          onChange={e => set('link', e.target.value)}
          placeholder="https://…"
        />

        <TextArea
          label="Fit notes"
          value={form.fitNotes}
          onChange={e => set('fitNotes', e.target.value)}
          placeholder="What the job involves, notable requirements, why it fits."
          rows={4}
        />

        <TextArea
          label="Your notes"
          value={form.userNotes}
          onChange={e => set('userNotes', e.target.value)}
          placeholder="Your own notes on this job — anything you want to remember."
          rows={4}
        />

        <Field
          label="Linked contacts"
          hint="Who do you know on this one — and how? A referral is worth recording (they don't have to work here). Check to link; click a name for details."
        >
          {linkableContacts.length === 0 ? (
            <p className={styles.contactEmpty}>
              No contacts yet — add the person who referred you, or anyone
              connected to this job.
            </p>
          ) : (
            <div className={styles.contactList}>
              {linkableContacts.map(c => {
                const linked = linkedId(c.id);
                const relation =
                  form.contactLinks.find(l => l.contactId === c.id)?.relation ||
                  'contact';
                const meta = [c.role, orgName(c.orgId)].filter(Boolean).join(' · ');
                return (
                  <div key={c.id} className={styles.contactItem}>
                    <input
                      type="checkbox"
                      className={styles.contactCheck}
                      checked={linked}
                      onChange={() => toggleContact(c.id)}
                      aria-label={`Link ${c.name || 'contact'} to this job`}
                    />
                    <button
                      type="button"
                      className={styles.contactName}
                      onClick={() => setContactModal({ mode: 'edit', contact: c })}
                      title="View contact details"
                    >
                      {c.name}
                      {meta ? (
                        <span className={styles.contactRole}> · {meta}</span>
                      ) : null}
                    </button>
                    {linked && (
                      <select
                        className={styles.contactRelation}
                        value={relation}
                        onChange={e => setContactRelation(c.id, e.target.value)}
                        aria-label={`How ${c.name} is connected to this job`}
                      >
                        {CONTACT_RELATIONS.map(r => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button
            type="button"
            className={`btn btn--ghost btn--sm ${styles.addContactBtn}`}
            onClick={() => setContactModal({ mode: 'new' })}
          >
            + New contact
          </button>
        </Field>
      </form>

      {contactModal && (
        <ContactForm
          contact={contactModal.mode === 'edit' ? contactModal.contact : null}
          defaultOrgId={form.orgId && form.orgId !== NEW_ORG ? form.orgId : ''}
          onSaved={saved => {
            // A contact created from here is auto-linked to this job.
            if (contactModal.mode === 'new' && saved?.id) {
              setForm(f =>
                f.contactLinks.some(l => l.contactId === saved.id)
                  ? f
                  : {
                      ...f,
                      contactLinks: [
                        ...f.contactLinks,
                        { contactId: saved.id, relation: 'contact' }
                      ]
                    }
              );
            }
          }}
          onClose={() => setContactModal(null)}
        />
      )}
    </Modal>
  );
}

// Merge a parsed JD into the current form. Matches the parsed org name against
// existing orgs (case-insensitive); falls back to staging a new org.
function applyParsed(parsed, { db, form, set, setNewOrgName, meta }) {
  if (parsed.title) set('title', parsed.title);
  if (parsed.location) set('location', parsed.location);
  if (parsed.fit_notes) set('fitNotes', parsed.fit_notes);
  if (parsed.fit_score) set('fitScore', String(parsed.fit_score));
  if (parsed.salary) set('salary', parsed.salary);
  // A URL import gives us the posting link for free — keep an existing one if set.
  if (meta?.url && !form.link) set('link', meta.url);

  const orgText = (parsed.org || '').trim();
  if (orgText) {
    const match = db.orgs.find(
      o => o.name.trim().toLowerCase() === orgText.toLowerCase()
    );
    if (match) {
      set('orgId', match.id);
    } else {
      set('orgId', NEW_ORG);
      setNewOrgName(orgText);
    }
  }
}

// --- Job-posting auto-fill panel -------------------------------------------
// Always shown at the top of the form: paste a job-board URL (Greenhouse /
// Lever) or the full description and we fill the fields. If both are filled the
// description wins, so an unsupported URL can be salvaged by pasting text.
function PasteJdPanel({ onParsed, userState }) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState('');
  const canParse = canUseParseToday();

  const hasInput = url.trim() || text.trim();

  async function parse() {
    if (!hasInput) return;
    // Prefer the pasted description when both are filled — so a URL we can't
    // handle can be salvaged by pasting the text without clearing the URL.
    const useUrl = !!url.trim() && !text.trim();
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          useUrl
            ? { url: url.trim(), userState }
            : { text, userState }
        )
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setError(data.error || 'Could not parse. Enter the job manually below.');
        return;
      }
      recordParseUse();
      recordTokenUse('parse', data._usage);
      // Score against (and persist) the compact fit digest. Fall back to the
      // full parsed text, then the local textarea, only if the digest is empty.
      onParsed(data, {
        url: useUrl ? url.trim() : '',
        jdText: data._digest || data._source || (useUrl ? '' : text)
      });
      setStatus('idle');
      setUrl('');
      setText('');
    } catch {
      setStatus('error');
      setError('Network error. Enter the job manually below.');
    }
  }

  return (
    <div className={styles.pastePanel}>
      <label className={styles.pasteLabel}>Job posting</label>
      <input
        type="url"
        className={styles.pasteUrl}
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://…  (Greenhouse or Lever)"
      />
      <div className={styles.pasteOr}>
        <span>or paste the full description</span>
      </div>
      <textarea
        className={styles.pasteArea}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste the full job description here…"
        rows={6}
      />
      {error && <p className={styles.pasteError}>{error}</p>}
      {!canParse && (
        <p className={styles.pasteError}>
          You've hit today's parsing limit on the shared AI key. Enter the job
          manually below — your daily allowance resets tomorrow.
        </p>
      )}
      <div className={styles.pasteActions}>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={parse}
          disabled={!hasInput || status === 'loading' || !canParse}
        >
          {status === 'loading' ? 'Working…' : 'Fetch & fill'}
        </button>
      </div>
    </div>
  );
}

// --- Fit-scoring panel -----------------------------------------------------
// Shows the verdict (auto-run after a parse, loaded from a prior score, or run
// on demand). The on-demand "Score" button works for any role and is the way to
// re-score after editing your Fit Criteria. Persisted on the app on submit.
function FitPanel({ status, fit, error, hasCriteria, canScore, onScore }) {
  // No criteria yet — point to setup. (Covers both initial idle and a scoring
  // attempt that found nothing to score against.)
  if (!hasCriteria && (status === 'idle' || status === 'nocriteria')) {
    return (
      <div className={styles.fitHint}>
        Want to see how closely a job fits? Set up your{' '}
        <Link to="/criteria">Fit Criteria</Link> — then score any job here.
      </div>
    );
  }

  if (status === 'limit') {
    return (
      <div className={styles.fitHint}>
        Daily fit-scoring limit reached on the shared AI key — resets tomorrow.
        The job's other fields are still filled in.
      </div>
    );
  }

  // Idle with criteria set: offer to score on demand.
  if (status === 'idle') {
    if (!canScore) return null;
    return (
      <div className={styles.fitPrompt}>
        <span className={styles.pasteHint}>
          Score this job against your Fit Criteria.
        </span>
        <button type="button" className="btn btn--sm" onClick={onScore}>
          ✦ Score this job
        </button>
      </div>
    );
  }

  return (
    <div className={styles.fitPanel}>
      <div className={styles.fitHead}>
        <strong>Fit against your criteria</strong>
        {status !== 'scoring' && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onScore}>
            Re-score
          </button>
        )}
      </div>
      {status === 'scoring' && <p className={styles.fitWorking}>Scoring…</p>}
      {status === 'error' && <p className={styles.pasteError}>{error}</p>}
      {status === 'done' && fit && (
        <>
          <FitVerdict fit={fit} />
          <Link to="/criteria" className={styles.fitRefine}>
            Adjust your Fit Criteria →
          </Link>
        </>
      )}
    </div>
  );
}

// --- Delete button ---------------------------------------------------------
function DeleteButton({ app, onClose }) {
  const { remove } = useDb();

  function handleDelete() {
    if (
      !confirm(`Delete "${app.title || 'this job'}"? This can't be undone.`)
    )
      return;
    remove('apps', app.id);
    onClose();
  }

  return (
    <button
      type="button"
      className={`btn btn--sm btn--danger ${styles.deleteBtn}`}
      onClick={handleDelete}
      title="Permanently delete this job"
    >
      🗑 Delete job
    </button>
  );
}
