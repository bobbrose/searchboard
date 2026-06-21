import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal.jsx';
import { Field, TextField, TextArea, SelectField, FieldRow } from '../components/Field.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import { STAGES } from '../lib/store.js';
import { canUseParseToday, recordParseUse, canUseToday, recordUse } from '../lib/store.js';
import { hasCriteria, checkHardFilters, summarizeFit } from '../lib/fit.js';
import { buildShareUrl } from '../lib/share.js';
import FitVerdict from '../components/FitVerdict.jsx';
import RefineCriteria from '../components/RefineCriteria.jsx';
import styles from './ApplicationForm.module.css';

const NEW_ORG = '__new__';

// Add/edit an application. Hosts the paste-a-JD flow and the Share button.
// `app` is the record being edited, or null/undefined to create a new one.
export default function ApplicationForm({ app, onClose }) {
  const { db, add, upsert } = useDb();
  const { orgName } = useSelectors();
  const isEdit = !!app?.id;

  const [form, setForm] = useState(() => ({
    title: app?.title || '',
    orgId: app?.orgId || '',
    stage: app?.stage || STAGES[0],
    location: app?.location || '',
    link: app?.link || '',
    fitNotes: app?.fitNotes || '',
    fitScore: app?.fitScore ?? '',
    contactIds: app?.contactIds || [],
    appliedDate: app?.appliedDate || '',
    salary: app?.salary || ''
  }));
  const [newOrgName, setNewOrgName] = useState('');

  // Fit scoring (auto-runs after a JD is parsed; persisted as an Analysis
  // entry on submit). `fitStatus`: idle | scoring | done | error | nocriteria | limit.
  const [fit, setFit] = useState(null);
  const [fitStatus, setFitStatus] = useState('idle');
  const [fitError, setFitError] = useState('');
  const [lastJd, setLastJd] = useState(''); // kept so refinement can re-score

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  // Score a parsed JD against the user's criteria. Hard filters are checked in
  // the browser first — a trip yields an instant verdict with no API call.
  async function runScoring({ jdText, salary, location }) {
    if (!jdText) return;
    setLastJd(jdText);
    setFit(null);
    setFitError('');

    if (!hasCriteria(db.profile)) {
      setFitStatus('nocriteria');
      return;
    }

    const hard = checkHardFilters(db.profile, { salary, jdText, location });
    if (hard) {
      setFit(hard);
      setFitStatus('done');
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
        setFitError(data.error || 'Could not score this role.');
        return;
      }
      recordUse('score');
      setFit(data);
      setFitStatus('done');
    } catch {
      setFitStatus('error');
      setFitError('Network error while scoring.');
    }
  }

  // Contacts to offer for linking: those at the selected org, plus any already
  // linked (so an existing link never silently disappears from the list).
  const linkableContacts = db.contacts.filter(
    c =>
      (form.orgId && form.orgId !== NEW_ORG && c.orgId === form.orgId) ||
      form.contactIds.includes(c.id)
  );

  function toggleContact(id) {
    set(
      'contactIds',
      form.contactIds.includes(id)
        ? form.contactIds.filter(c => c !== id)
        : [...form.contactIds, id]
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
    const record = {
      ...(app?.id ? { id: app.id } : {}),
      ...form,
      orgId,
      fitScore: form.fitScore === '' ? null : Number(form.fitScore)
    };
    const saved = upsert('apps', record);

    // Persist a fresh fit verdict as a first-class Analysis entry, linked to
    // the (possibly just-created) app. Only a verdict scored this session is
    // written — opening an existing app and saving without re-scoring won't.
    if (fit) {
      add('analyses', {
        type: 'Fit scoring',
        title: `Fit: ${form.title || 'role'}`,
        appId: saved.id,
        orgId,
        body: summarizeFit(fit),
        fit
      });
    }

    onClose();
  }

  return (
    <Modal
      title={isEdit ? 'Edit application' : 'New application'}
      onClose={onClose}
      wide
      footer={
        <>
          {isEdit && (
            <ShareButton app={app} orgLabel={orgName(app.orgId)} />
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="application-form" className="btn btn--primary">
            {isEdit ? 'Save changes' : 'Add application'}
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
        onRescore={lastJd ? () => runScoring({ jdText: lastJd, salary: form.salary, location: form.location }) : null}
      />

      <form id="application-form" onSubmit={handleSubmit}>
        <TextField
          label="Role title"
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
          </Field>
          <SelectField
            label="Stage"
            value={form.stage}
            onChange={e => set('stage', e.target.value)}
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

        <FieldRow>
          <TextField
            label="Location"
            value={form.location}
            onChange={e => set('location', e.target.value)}
            placeholder="Remote (US)"
          />
          <SelectField
            label="Seniority / scope (1–5)"
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
          placeholder="What the role involves, notable requirements, why it fits."
          rows={4}
        />

        {linkableContacts.length > 0 && (
          <Field
            label="Linked contacts"
            hint={
              form.orgId && form.orgId !== NEW_ORG
                ? 'Contacts at this org.'
                : 'Pick an org to see its contacts.'
            }
          >
            <div className={styles.contactList}>
              {linkableContacts.map(c => (
                <label key={c.id} className={styles.contactItem}>
                  <input
                    type="checkbox"
                    checked={form.contactIds.includes(c.id)}
                    onChange={() => toggleContact(c.id)}
                  />
                  <span>
                    {c.name}
                    {c.role ? <span className={styles.contactRole}> · {c.role}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </Field>
        )}
      </form>
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

// --- Paste-a-JD panel ------------------------------------------------------
// Two ways to auto-fill, shown together: paste a job-board URL (Greenhouse /
// Lever) or paste the full description. Whichever is filled gets parsed — a URL
// takes priority since it also gives us the posting link for free.
function PasteJdPanel({ onParsed, userState }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState('');
  const canParse = canUseParseToday();

  const hasInput = url.trim() || text.trim();

  async function parse() {
    if (!hasInput) return;
    const useUrl = !!url.trim();
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
        setError(data.error || 'Could not parse. Enter the role manually below.');
        return;
      }
      recordParseUse();
      // _source is the exact text the server parsed (the only way URL mode has
      // the JD text); fall back to the local textarea for paste mode.
      onParsed(data, {
        url: useUrl ? url.trim() : '',
        jdText: data._source || (useUrl ? '' : text)
      });
      setStatus('idle');
      setOpen(false);
      setUrl('');
      setText('');
    } catch {
      setStatus('error');
      setError('Network error. Enter the role manually below.');
    }
  }

  if (!open) {
    return (
      <div className={styles.pastePrompt}>
        <div>
          <strong>Have the job posting?</strong>{' '}
          <span className={styles.pasteHint}>
            Paste a link or the description and we'll fill in the fields for you.
          </span>
        </div>
        <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>
          ✦ Auto-fill from a job posting
        </button>
      </div>
    );
  }

  return (
    <div className={styles.pastePanel}>
      <label className={styles.pasteLabel}>Paste a job-posting URL</label>
      <input
        type="url"
        className={styles.pasteUrl}
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://…  (Greenhouse or Lever)"
        autoFocus
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
        disabled={!!url.trim()}
      />
      {error && <p className={styles.pasteError}>{error}</p>}
      {!canParse && (
        <p className={styles.pasteError}>
          You've hit today's parsing limit on the shared AI key. Enter the role
          manually below — your daily allowance resets tomorrow.
        </p>
      )}
      <div className={styles.pasteActions}>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            setOpen(false);
            setError('');
          }}
        >
          Cancel
        </button>
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
// Shows the auto-run verdict below the paste panel. Saved as an Analysis entry
// when the form is submitted.
function FitPanel({ status, fit, error, onRescore }) {
  if (status === 'idle') return null;

  if (status === 'nocriteria') {
    return (
      <div className={styles.fitHint}>
        Want a fit verdict against your criteria? Set up your{' '}
        <Link to="/settings">Search Criteria</Link> and the next paste scores
        automatically.
      </div>
    );
  }

  if (status === 'limit') {
    return (
      <div className={styles.fitHint}>
        Daily fit-scoring limit reached on the shared AI key — resets tomorrow.
        The role's other fields are still filled in.
      </div>
    );
  }

  return (
    <div className={styles.fitPanel}>
      <div className={styles.fitHead}>
        <strong>Fit against your criteria</strong>
        {onRescore && status !== 'scoring' && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onRescore}>
            Re-score
          </button>
        )}
      </div>
      {status === 'scoring' && <p className={styles.fitWorking}>Scoring…</p>}
      {status === 'error' && <p className={styles.pasteError}>{error}</p>}
      {status === 'done' && fit && (
        <>
          <FitVerdict fit={fit} />
          {onRescore && <RefineCriteria onRefined={onRescore} />}
        </>
      )}
    </div>
  );
}

// --- Share button ----------------------------------------------------------
function ShareButton({ app, orgLabel }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = buildShareUrl(app, orgLabel);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — surface the URL to copy.
      window.prompt('Copy this share link:', url);
    }
  }

  return (
    <button
      type="button"
      className={`btn btn--sm ${styles.shareBtn}`}
      onClick={share}
      title="Copy a read-only link to this role"
    >
      {copied ? '✓ Link copied' : '🔗 Share this role'}
    </button>
  );
}
