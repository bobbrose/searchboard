import { useMemo, useState } from 'react';
import Modal from '../components/Modal.jsx';
import Badge from '../components/Badge.jsx';
import { TextField, TextArea, SelectField, FieldRow, Field } from '../components/Field.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import { RELATIONSHIP_TYPES } from '../lib/store.js';
import styles from './ContactForm.module.css';

const STAGE_TONE = {
  Researching: 'neutral',
  Applied: 'accent',
  Interviewing: 'warm',
  Offer: 'ok',
  Closed: 'done'
};

// Add/edit a contact. `contact` is the record being edited, or null to create.
// `defaultOrgId` preselects an org (e.g. when adding from an org's card).
// `onOpenJob(app)` (optional) lets the linked-jobs list jump to a job.
export default function ContactForm({ contact, defaultOrgId, onClose, onOpenJob }) {
  const { db, upsert } = useDb();
  const { appsForContact } = useSelectors();
  const isEdit = !!contact?.id;

  // Jobs this contact is linked to, with their relation (referrer / contact /
  // recruiter) and current stage — the connective tissue, surfaced on open.
  const jobs = isEdit ? appsForContact(contact.id) : [];

  // Initial snapshot kept for dirty-tracking, so "Save changes" stays disabled
  // until something actually changes (matches ApplicationForm).
  const initialForm = useMemo(
    () => ({
      name: contact?.name || '',
      orgId: contact?.orgId || defaultOrgId || '',
      role: contact?.role || '',
      relationshipType: contact?.relationshipType || RELATIONSHIP_TYPES[0],
      email: contact?.email || '',
      phone: contact?.phone || '',
      lastContacted: contact?.lastContacted || '',
      notes: contact?.notes || ''
    }),
    [contact, defaultOrgId]
  );
  const [form, setForm] = useState(initialForm);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  function handleSubmit(e) {
    e.preventDefault();
    upsert('contacts', { ...(contact?.id ? { id: contact.id } : {}), ...form });
    onClose();
  }

  return (
    <Modal
      title={isEdit ? 'Edit contact' : 'New contact'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="contact-form"
            className="btn btn--primary"
            disabled={isEdit && !isDirty}
          >
            {isEdit ? 'Save changes' : 'Add contact'}
          </button>
        </>
      }
    >
      {jobs.length > 0 && (
        <div className={styles.jobs}>
          <span className={styles.jobsLabel}>
            Linked jobs ({jobs.length})
          </span>
          {jobs.map(({ app, relation }) => (
            <button
              type="button"
              key={app.id}
              className={styles.job}
              onClick={() => onOpenJob?.(app)}
              title={onOpenJob ? 'Open this job' : undefined}
            >
              {relation === 'referrer' && (
                <span className={styles.referred}>↳ referred</span>
              )}
              <span className={styles.jobTitle}>{app.title || 'Untitled job'}</span>
              <Badge tone={STAGE_TONE[app.stage]}>{app.stage}</Badge>
            </button>
          ))}
        </div>
      )}

      <form id="contact-form" onSubmit={handleSubmit}>
        <FieldRow>
          <TextField
            label="Name"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Jordan Lee"
            required
            autoFocus
          />
          <TextField
            label="Role / title"
            value={form.role}
            onChange={e => set('role', e.target.value)}
            placeholder="VP of Product"
          />
        </FieldRow>

        <FieldRow>
          <Field label="Organization">
            <select value={form.orgId} onChange={e => set('orgId', e.target.value)}>
              <option value="">— No org —</option>
              {db.orgs.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <SelectField
            label="Relationship"
            value={form.relationshipType}
            onChange={e => set('relationshipType', e.target.value)}
            options={RELATIONSHIP_TYPES}
          />
        </FieldRow>

        <FieldRow>
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="jordan@acme.com"
          />
          <TextField
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="(555) 555-5555"
          />
        </FieldRow>

        <TextField
          label="Last contacted"
          type="date"
          value={form.lastContacted}
          onChange={e => set('lastContacted', e.target.value)}
          hint="Drives the staleness indicator on the contacts list."
        />

        <TextArea
          label="Notes"
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="How you know them, what you've discussed, next steps."
          rows={4}
        />
      </form>
    </Modal>
  );
}
