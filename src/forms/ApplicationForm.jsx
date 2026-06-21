import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { Field, TextField, TextArea, SelectField, FieldRow } from '../components/Field.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import { STAGES } from '../lib/store.js';
import { canUseParseToday, recordParseUse } from '../lib/store.js';
import { buildShareUrl } from '../lib/share.js';
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

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

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
    upsert('apps', record);
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
        onParsed={(parsed, meta) =>
          applyParsed(parsed, { db, form, set, setNewOrgName, meta })
        }
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
      onParsed(data, { url: useUrl ? url.trim() : '' });
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
