import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import OrgForm from '../forms/OrgForm.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import styles from './Orgs.module.css';

export default function Orgs() {
  const { db } = useDb();
  const [editing, setEditing] = useState(null); // org record, {} for new, or null

  const orgs = [...db.orgs].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '')
  );

  return (
    <>
      <PageHeader
        title="Orgs"
        subtitle={
          orgs.length
            ? `${orgs.length} organization${orgs.length === 1 ? '' : 's'}`
            : undefined
        }
      >
        <button className="btn btn--primary" onClick={() => setEditing({})}>
          + Add org
        </button>
      </PageHeader>

      {orgs.length === 0 ? (
        <EmptyState
          icon="◳"
          title="No organizations yet"
          hint="Add the companies you're researching. Jobs and contacts link back to them."
          action={
            <button className="btn btn--primary" onClick={() => setEditing({})}>
              + Add your first org
            </button>
          }
        />
      ) : (
        <div className={styles.grid}>
          {orgs.map(org => (
            <OrgCard key={org.id} org={org} onEdit={() => setEditing(org)} />
          ))}
        </div>
      )}

      {editing && (
        <OrgForm org={editing.id ? editing : null} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function OrgCard({ org, onEdit }) {
  const { remove } = useDb();
  const { appsForOrg, contactsForOrg } = useSelectors();
  const navigate = useNavigate();
  const apps = appsForOrg(org.id);
  const contacts = contactsForOrg(org.id);

  // Strip protocol for a tidy display label.
  const hostLabel = org.website
    ? org.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : '';

  return (
    <article className={styles.card}>
      <button className={styles.cardMain} onClick={onEdit}>
        <h3 className={styles.name}>{org.name || 'Untitled org'}</h3>
        <div className={styles.metaRow}>
          {org.industry && <span>{org.industry}</span>}
          {org.industry && org.location && <span className={styles.dot}>·</span>}
          {org.location && <span>{org.location}</span>}
        </div>
        {org.notes && <p className={styles.notes}>{org.notes}</p>}
      </button>

      <div className={styles.footer}>
        <div className={styles.links}>
          {apps.length > 0 && (
            <button
              className={styles.chip}
              onClick={() => navigate('/')}
              title="View jobs"
            >
              ▤ {apps.length} job{apps.length === 1 ? '' : 's'}
            </button>
          )}
          {contacts.length > 0 && (
            <button
              className={styles.chip}
              onClick={() => navigate('/contacts')}
              title="View contacts"
            >
              ☺ {contacts.length}
            </button>
          )}
          {hostLabel && (
            <a
              className={styles.chip}
              href={org.website}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              title={org.website}
            >
              ↗ {hostLabel}
            </a>
          )}
        </div>
        <button
          className="btn btn--ghost btn--sm btn--danger"
          onClick={() => {
            if (
              confirm(
                `Delete "${org.name || 'this org'}"? Linked jobs and contacts will keep their other data but lose this org link.`
              )
            ) {
              remove('orgs', org.id);
            }
          }}
          title="Delete org"
        >
          ✕
        </button>
      </div>
    </article>
  );
}
