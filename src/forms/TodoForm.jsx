import { useState } from 'react';
import Modal from '../components/Modal.jsx';
import { TextField, SelectField, Field, FieldRow } from '../components/Field.jsx';
import { useDb } from '../lib/db.jsx';

const LINK_TYPES = [
  { value: '', label: '— Nothing —' },
  { value: 'app', label: 'Application' },
  { value: 'org', label: 'Organization' },
  { value: 'contact', label: 'Contact' }
];

// Add/edit an action item. Links optionally to one entity (app/org/contact).
export default function TodoForm({ todo, defaults, onClose }) {
  const { db, upsert } = useDb();
  const isEdit = !!todo?.id;

  const [form, setForm] = useState(() => ({
    title: todo?.title || '',
    dueDate: todo?.dueDate || '',
    done: todo?.done || false,
    linkedType: todo?.linkedType || defaults?.linkedType || '',
    linkedId: todo?.linkedId || defaults?.linkedId || ''
  }));

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  // Changing the link type clears the previously-selected target.
  const setLinkedType = value =>
    setForm(f => ({ ...f, linkedType: value, linkedId: '' }));

  // Options for the linked-entity picker depend on the chosen type.
  const linkOptions =
    form.linkedType === 'app'
      ? db.apps.map(a => ({ value: a.id, label: a.title || 'Untitled role' }))
      : form.linkedType === 'org'
        ? db.orgs.map(o => ({ value: o.id, label: o.name || 'Untitled org' }))
        : form.linkedType === 'contact'
          ? db.contacts.map(c => ({ value: c.id, label: c.name || 'Unnamed' }))
          : [];

  function handleSubmit(e) {
    e.preventDefault();
    // Clear the link id if no type is selected.
    const record = {
      ...(todo?.id ? { id: todo.id } : {}),
      ...form,
      linkedId: form.linkedType ? form.linkedId : ''
    };
    upsert('todos', record);
    onClose();
  }

  return (
    <Modal
      title={isEdit ? 'Edit action item' : 'New action item'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="todo-form" className="btn btn--primary">
            {isEdit ? 'Save changes' : 'Add action item'}
          </button>
        </>
      }
    >
      <form id="todo-form" onSubmit={handleSubmit}>
        <TextField
          label="What needs doing?"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="e.g. Send recruiter salary expectations"
          required
          autoFocus
        />

        <TextField
          label="Due date"
          type="date"
          value={form.dueDate}
          onChange={e => set('dueDate', e.target.value)}
          hint="Drives urgency sorting. Leave blank for someday/maybe."
        />

        <FieldRow>
          <SelectField
            label="Link to"
            value={form.linkedType}
            onChange={e => setLinkedType(e.target.value)}
            options={LINK_TYPES}
          />
          {form.linkedType && (
            <Field label="Which one">
              <select
                value={form.linkedId}
                onChange={e => set('linkedId', e.target.value)}
              >
                <option value="">— Select —</option>
                {linkOptions.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </FieldRow>

        <label className="checkboxRow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={form.done}
            onChange={e => set('done', e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span>Mark as done</span>
        </label>
      </form>
    </Modal>
  );
}
