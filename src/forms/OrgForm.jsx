import { useEffect, useState } from 'react';
import Modal from '../components/Modal.jsx';
import { TextField, TextArea, FieldRow } from '../components/Field.jsx';
import { useDb } from '../lib/db.jsx';
import { findWebsite } from '../lib/website.js';

// Add/edit an organization. `org` is the record being edited, or null to create.
export default function OrgForm({ org, onClose }) {
  const { upsert } = useDb();
  const isEdit = !!org?.id;

  const [form, setForm] = useState(() => ({
    name: org?.name || '',
    website: org?.website || '',
    industry: org?.industry || '',
    location: org?.location || '',
    notes: org?.notes || ''
  }));

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  // On open, if the website is blank but we have a name, try to find one and
  // fill the field (the user still saves to keep it). Best-effort and de-duped.
  const [findingSite, setFindingSite] = useState(false);
  useEffect(() => {
    if (form.website.trim() || !form.name.trim()) return;
    let cancelled = false;
    setFindingSite(true);
    findWebsite({ name: form.name, industry: form.industry, location: form.location })
      .then(site => {
        if (cancelled) return;
        // Don't clobber anything the user typed while we were looking.
        if (site) setForm(f => (f.website.trim() ? f : { ...f, website: site }));
      })
      .finally(() => {
        if (!cancelled) setFindingSite(false);
      });
    return () => {
      cancelled = true;
    };
    // Run once for the org this form opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    upsert('orgs', { ...(org?.id ? { id: org.id } : {}), ...form });
    onClose();
  }

  return (
    <Modal
      title={isEdit ? 'Edit organization' : 'New organization'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="org-form" className="btn btn--primary">
            {isEdit ? 'Save changes' : 'Add organization'}
          </button>
        </>
      }
    >
      <form id="org-form" onSubmit={handleSubmit}>
        <TextField
          label="Name"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Acme Corp"
          required
          autoFocus
        />
        <FieldRow>
          <TextField
            label="Industry"
            value={form.industry}
            onChange={e => set('industry', e.target.value)}
            placeholder="B2B SaaS"
          />
          <TextField
            label="Location"
            value={form.location}
            onChange={e => set('location', e.target.value)}
            placeholder="San Francisco / Remote"
          />
        </FieldRow>
        <TextField
          label="Website"
          type="url"
          value={form.website}
          onChange={e => set('website', e.target.value)}
          placeholder={findingSite ? 'Finding website…' : 'https://…'}
          hint={findingSite ? 'Looking for the official website…' : undefined}
        />
        <TextArea
          label="Research notes"
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="What they do, why they're interesting, anything you've learned."
          rows={5}
        />
      </form>
    </Modal>
  );
}
