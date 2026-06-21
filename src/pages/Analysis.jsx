import { useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import FitVerdict from '../components/FitVerdict.jsx';
import AnalysisForm from '../forms/AnalysisForm.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import { ANALYSIS_TYPES } from '../lib/store.js';
import { formatDate } from '../lib/dates.js';
import styles from './Analysis.module.css';

export default function Analysis() {
  const { db } = useDb();
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('All');

  const entries = db.analyses.filter(e => filter === 'All' || e.type === filter);

  // Group filtered entries by type, preserving the canonical type order.
  const grouped = ANALYSIS_TYPES.map(type => ({
    type,
    items: entries
      .filter(e => e.type === type)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  })).filter(g => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="Analysis"
        subtitle={
          db.analyses.length
            ? `${db.analyses.length} entr${db.analyses.length === 1 ? 'y' : 'ies'}`
            : undefined
        }
      >
        {db.analyses.length > 0 && (
          <select
            className={styles.filter}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="All">All moments</option>
            {ANALYSIS_TYPES.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn--primary" onClick={() => setEditing({})}>
          + Add entry
        </button>
      </PageHeader>

      {db.analyses.length === 0 ? (
        <EmptyState
          icon="✎"
          title="No analysis yet"
          hint="Capture pre-application research, post-interview debriefs, and strategy notes — the thinking that's easy to lose."
          action={
            <button className="btn btn--primary" onClick={() => setEditing({})}>
              + Write your first entry
            </button>
          }
        />
      ) : grouped.length === 0 ? (
        <EmptyState icon="✎" title={`No "${filter}" entries`} hint="Try a different filter." />
      ) : (
        grouped.map(group => (
          <section key={group.type} className={styles.group}>
            <h2 className={styles.groupTitle}>
              {group.type}
              <span className={styles.groupCount}>{group.items.length}</span>
            </h2>
            <div className={styles.list}>
              {group.items.map(entry => (
                <AnalysisCard
                  key={entry.id}
                  entry={entry}
                  onEdit={() => setEditing(entry)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {editing && (
        <AnalysisForm
          entry={editing.id ? editing : null}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function AnalysisCard({ entry, onEdit }) {
  const { remove } = useDb();
  const { orgName, appById } = useSelectors();
  const app = entry.appId ? appById(entry.appId) : null;
  const org = entry.orgId ? orgName(entry.orgId) : '';

  return (
    <article className={styles.card}>
      <button className={styles.cardMain} onClick={onEdit}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>{entry.title || 'Untitled'}</h3>
          <span className={styles.date}>{formatDate(entry.updatedAt)}</span>
        </div>
        {entry.fit ? (
          <div className={styles.fit}>
            <FitVerdict fit={entry.fit} />
          </div>
        ) : (
          entry.body && <p className={styles.body}>{entry.body}</p>
        )}
        {(org || app) && (
          <div className={styles.tags}>
            {org && <Badge tone="accent">◳ {org}</Badge>}
            {app && <Badge tone="neutral">▤ {app.title || 'Untitled role'}</Badge>}
          </div>
        )}
      </button>
      <button
        className={`btn btn--ghost btn--sm btn--danger ${styles.del}`}
        onClick={() => {
          if (confirm(`Delete "${entry.title || 'this entry'}"?`)) {
            remove('analyses', entry.id);
          }
        }}
        title="Delete"
      >
        ✕
      </button>
    </article>
  );
}
