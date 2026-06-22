import { useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import ContactForm from '../forms/ContactForm.jsx';
import ApplicationForm from '../forms/ApplicationForm.jsx';
import TodoForm from '../forms/TodoForm.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import { staleness, formatDate, today, daysFromToday } from '../lib/dates.js';
import styles from './Contacts.module.css';

const STAGE_TONE = {
  Researching: 'neutral',
  Applied: 'accent',
  Interviewing: 'warm',
  Offer: 'ok',
  Closed: 'done'
};

export default function Contacts() {
  const { db, remove, update } = useDb();
  const { orgName, appsForContact } = useSelectors();
  const [editing, setEditing] = useState(null); // contact, {} for new, or null
  const [followUp, setFollowUp] = useState(null); // contact to schedule a follow-up for
  const [jobEditing, setJobEditing] = useState(null); // job opened from a contact's links

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
          hint="Track the people in your search — recruiters, referrals, warm intros — who referred you where, and when you last reached out."
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
                <th>Relationship</th>
                <th>Linked jobs</th>
                <th>Last contacted</th>
                <th className={styles.actionsCol}></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => {
                const stale = staleness(c.lastContacted);
                const links = appsForContact(c.id);
                return (
                  <tr key={c.id} className={styles.row} onClick={() => setEditing(c)}>
                    <td>
                      <div className={styles.name}>{c.name || 'Unnamed'}</div>
                      <div className={styles.sub}>
                        {[c.role, orgName(c.orgId)].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td>
                      {c.relationshipType && (
                        <Badge tone="neutral">{c.relationshipType}</Badge>
                      )}
                    </td>
                    <td>
                      {links.length === 0 ? (
                        <span className={styles.noLinks}>—</span>
                      ) : (
                        <div className={styles.jobLinks}>
                          {links.map(({ app, relation }) => (
                            <div key={app.id} className={styles.jobLink}>
                              {relation === 'referrer' && (
                                <span className={styles.referredTag}>↳ referred</span>
                              )}
                              <span className={styles.jobTitle}>
                                {app.title || 'Untitled job'}
                              </span>
                              <Badge tone={STAGE_TONE[app.stage]}>{app.stage}</Badge>
                            </div>
                          ))}
                        </div>
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
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => update('contacts', c.id, { lastContacted: today() })}
                        title="Mark that you reached out today (resets staleness)"
                      >
                        Log touch
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setFollowUp(c)}
                        title="Create a follow-up action item linked to this contact"
                      >
                        Follow up
                      </button>
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
          onOpenJob={app => {
            setEditing(null);
            setJobEditing(app);
          }}
        />
      )}

      {jobEditing && (
        <ApplicationForm app={jobEditing} onClose={() => setJobEditing(null)} />
      )}

      {followUp && (
        <TodoForm
          defaults={{
            title: `Follow up with ${followUp.name || 'contact'}`,
            dueDate: daysFromToday(7),
            linkedType: 'contact',
            linkedId: followUp.id
          }}
          onClose={() => setFollowUp(null)}
        />
      )}
    </>
  );
}
