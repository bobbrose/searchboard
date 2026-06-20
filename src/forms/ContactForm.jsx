import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { TextField, TextArea, SelectField, FieldRow, Field } from '../components/Field.jsx';
import { useDb } from '../lib/db.jsx';
import { RELATIONSHIP_TYPES } from '../lib/store.js';

// Add/edit a contact. `contact` is the record being edited, or null to create.
// `defaultOrgId` preselects an org (e.g. when adding from an org's card).
export default function ContactForm({ contact, defaultOrgId, onClose }) {
  const { db, upsert } = useDb();
  const isEdit = !!contact?.id;

  const [form, setForm] = useState(() => ({
    name: contact?.name || '',
    orgId: contact?.orgId || defaultOrgId || '',
    role: contact?.role || '',
    relationshipType: contact?.relationshipType || RELATIONSHIP_TYPES[0],
    email: contact?.email || '',
    phone: contact?.phone || '',
    lastContacted: contact?.lastContacted || '',
    notes: contact?.notes || ''
  }));

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

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
          <button type="submit" form="contact-form" className="btn btn--primary">
            {isEdit ? 'Save changes' : 'Add contact'}
          </button>
        </>
      }
    >
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
