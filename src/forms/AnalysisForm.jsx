import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { TextField, TextArea, SelectField, Field, FieldRow } from '../components/Field.jsx';
import { useDb } from '../lib/db.jsx';
import { ANALYSIS_TYPES } from '../lib/store.js';

// Add/edit an analysis entry. The `type` (moment) field is first-class — see
// VISION principle #2. Entries link optionally to an org and/or application.
export default function AnalysisForm({ entry, defaults, onClose }) {
  const { db, upsert } = useDb();
  const isEdit = !!entry?.id;

  const [form, setForm] = useState(() => ({
    type: entry?.type || defaults?.type || ANALYSIS_TYPES[0],
    title: entry?.title || '',
    body: entry?.body || '',
    orgId: entry?.orgId || defaults?.orgId || '',
    appId: entry?.appId || defaults?.appId || ''
  }));

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  function handleSubmit(e) {
    e.preventDefault();
    upsert('analyses', { ...(entry?.id ? { id: entry.id } : {}), ...form });
    onClose();
  }

  return (
    <Modal
      title={isEdit ? 'Edit analysis entry' : 'New analysis entry'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="analysis-form" className="btn btn--primary">
            {isEdit ? 'Save changes' : 'Add entry'}
          </button>
        </>
      }
    >
      <form id="analysis-form" onSubmit={handleSubmit}>
        <SelectField
          label="Moment / type"
          hint="What kind of thinking is this? Drives how the dashboard groups it."
          value={form.type}
          onChange={e => set('type', e.target.value)}
          options={ANALYSIS_TYPES}
        />

        <TextField
          label="Title"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="e.g. Why Northwind, post-screen read"
          required
          autoFocus
        />

        <FieldRow>
          <Field label="Linked org" hint="Optional">
            <select value={form.orgId} onChange={e => set('orgId', e.target.value)}>
              <option value="">— None —</option>
              {db.orgs.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Linked application" hint="Optional">
            <select value={form.appId} onChange={e => set('appId', e.target.value)}>
              <option value="">— None —</option>
              {db.apps.map(a => (
                <option key={a.id} value={a.id}>
                  {a.title || 'Untitled role'}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>

        <TextArea
          label="Notes"
          value={form.body}
          onChange={e => set('body', e.target.value)}
          placeholder="The research, the read, the judgment call. Write it down so you can act on it."
          rows={8}
        />
      </form>
    </Modal>
  );
}
