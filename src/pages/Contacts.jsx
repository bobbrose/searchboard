import { useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import ContactForm from '../forms/ContactForm.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import { staleness, formatDate } from '../lib/dates.js';
import styles from './Contacts.module.css';

export default function Contacts() {
  const { db, remove } = useDb();
  const { orgName } = useSelectors();
  const [editing, setEditing] = useState(null); // contact, {} for new, or null

  // Sort by staleness: never-contacted and most-overdue first, freshest last.
  // We sort on "days since contact" descending; missing dates sort to the top.
  const contacts = [...db.contacts].sort((a, b) => {
    const da = a.lastContacted ? new Date(a.lastContacted).getTime() : 0;
    const dbb = b.lastContacted ? new Date(b.lastContacted).getTime() : 0;
    return da - dbb; // oldest / missing first
  });

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={
          contacts.length
            ? `${contacts.length} contact${contacts.length === 1 ? '' : 's'}`
            : undefined
        }
      >
        <button className="btn btn--primary" onClick={() => setEditing({})}>
          + Add contact
        </button>
      </PageHeader>

      {contacts.length === 0 ? (
        <EmptyState
          icon="☺"
          title="No contacts yet"
          hint="Track the people in your search — recruiters, referrals, warm intros — and when you last reached out."
          action={
            <button className="btn btn--primary" onClick={() => setEditing({})}>
              + Add your first contact
            </button>
          }
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Org</th>
                <th>Relationship</th>
                <th>Last contacted</th>
                <th className={styles.actionsCol}></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => {
                const stale = staleness(c.lastContacted);
                return (
                  <tr key={c.id} className={styles.row} onClick={() => setEditing(c)}>
                    <td>
                      <div className={styles.name}>{c.name || 'Unnamed'}</div>
                      {c.role && <div className={styles.role}>{c.role}</div>}
                    </td>
                    <td>{orgName(c.orgId)}</td>
                    <td>
                      {c.relationshipType && (
                        <Badge tone="neutral">{c.relationshipType}</Badge>
                      )}
                    </td>
                    <td>
                      <div className={styles.staleCell}>
                        <Badge tone={stale.tone} title={formatDate(c.lastContacted)}>
                          {stale.label}
                        </Badge>
                      </div>
                    </td>
                    <td className={styles.actionsCol} onClick={e => e.stopPropagation()}>
                      {c.email && (
                        <a
                          className="btn btn--ghost btn--sm"
                          href={`mailto:${c.email}`}
                          title={c.email}
                        >
                          ✉
                        </a>
                      )}
                      <button
                        className="btn btn--ghost btn--sm btn--danger"
                        onClick={() => {
                          if (confirm(`Delete "${c.name || 'this contact'}"?`)) {
                            remove('contacts', c.id);
                          }
                        }}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ContactForm
          contact={editing.id ? editing : null}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
