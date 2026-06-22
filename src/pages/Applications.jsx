import { useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import { FitBadges } from '../components/FitVerdict.jsx';
import ApplicationForm from '../forms/ApplicationForm.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import { STAGES, exportAsFile, importFromFile, mergeDB } from '../lib/store.js';
import { buildShareUrl } from '../lib/share.js';
import { formatDate, today } from '../lib/dates.js';
import styles from './Applications.module.css';

const STAGE_TONE = {
  Researching: 'neutral',
  Applied: 'accent',
  Interviewing: 'warm',
  Offer: 'ok',
  Closed: 'done'
};

export default function Applications() {
  const { db, replaceAll } = useDb();
  const [view, setView] = useState('kanban'); // 'kanban' | 'list'
  const [editing, setEditing] = useState(null); // app record, {} for new, or null
  const fileRef = useRef(null);

  const hasApps = db.apps.length > 0;

  // Merge-import: newer records win, nothing is erased. (Settings still offers a
  // full replace-import for the rare "start over from this file" case.)
  async function onImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const incoming = await importFromFile(file);
      const merged = mergeDB(db, incoming);
      const COLLECTIONS = ['apps', 'orgs', 'contacts', 'analyses', 'todos'];
      const added = COLLECTIONS.reduce(
        (n, k) => n + (merged[k].length - db[k].length),
        0
      );
      const incomingTotal = COLLECTIONS.reduce(
        (n, k) => n + (incoming[k]?.length || 0),
        0
      );
      const updated = incomingTotal - added; // matched existing ids (newest wins)
      const changed = COLLECTIONS.some(
        k =>
          merged[k].length !== db[k].length ||
          merged[k].some((rec, i) => rec !== db[k][i])
      );
      if (!changed) {
        alert("You're already up to date with this file. Nothing to merge.");
        return;
      }
      if (
        confirm(
          `Merge ${incomingTotal} record(s) from this file into your data?\n\n` +
            `• ${added} new record(s) added\n` +
            `• ${updated} matched existing record(s) (newer version kept)\n\n` +
            `Your current data is not erased.`
        )
      ) {
        replaceAll(merged);
      }
    } catch (err) {
      alert(err.message || 'Import failed.');
    } finally {
      e.target.value = ''; // allow re-importing the same file
    }
  }

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle={
          hasApps
            ? `${db.apps.length} job${db.apps.length === 1 ? '' : 's'} tracked`
            : undefined
        }
      >
        <div className={styles.dataBtns}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => exportAsFile(db)}
            title="Download all data as a JSON file"
          >
            ↓ Export
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => fileRef.current?.click()}
            title="Merge data from a JSON file (newer records win; nothing erased)"
          >
            ↑ Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onImport}
            className={styles.hiddenInput}
          />
        </div>
        <div className={styles.toggle} role="tablist" aria-label="View">
          <button
            className={`${styles.toggleBtn} ${view === 'kanban' ? styles.toggleActive : ''}`}
            onClick={() => setView('kanban')}
            role="tab"
            aria-selected={view === 'kanban'}
          >
            ▦ Kanban
          </button>
          <button
            className={`${styles.toggleBtn} ${view === 'list' ? styles.toggleActive : ''}`}
            onClick={() => setView('list')}
            role="tab"
            aria-selected={view === 'list'}
          >
            ☰ List
          </button>
        </div>
        <button className="btn btn--primary" onClick={() => setEditing({})}>
          + Add job
        </button>
      </PageHeader>

      {!hasApps ? (
        <EmptyState
          icon="▤"
          title="No jobs yet"
          hint="Add a job manually, or paste a job description and let it fill the fields in."
          action={
            <button className="btn btn--primary" onClick={() => setEditing({})}>
              + Add your first job
            </button>
          }
        />
      ) : view === 'kanban' ? (
        <KanbanView onEdit={setEditing} />
      ) : (
        <ListView onEdit={setEditing} />
      )}

      {editing && (
        <ApplicationForm
          app={editing.id ? editing : null}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

// --- Kanban ----------------------------------------------------------------
function KanbanView({ onEdit }) {
  const { db, update } = useDb();

  return (
    <div className={styles.board}>
      {STAGES.map(stage => {
        const apps = db.apps.filter(a => a.stage === stage);
        return (
          <section key={stage} className={styles.column}>
            <header className={styles.colHeader}>
              <span>{stage}</span>
              <span className={styles.colCount}>{apps.length}</span>
            </header>
            <div className={styles.colBody}>
              {apps.map(app => (
                <AppCard
                  key={app.id}
                  app={app}
                  onEdit={() => onEdit(app)}
                  onMove={stage =>
                    update('apps', app.id, {
                      stage,
                      // Stamp the applied date on first move into "Applied",
                      // without clobbering a date already recorded.
                      ...(stage === 'Applied' && !app.appliedDate
                        ? { appliedDate: today() }
                        : {})
                    })
                  }
                />
              ))}
              {apps.length === 0 && <p className={styles.colEmpty}>—</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AppCard({ app, onEdit, onMove }) {
  const { orgName, contactsForApp } = useSelectors();
  const contacts = contactsForApp(app);

  return (
    <article className={styles.card}>
      <button className={styles.cardMain} onClick={onEdit}>
        <h3 className={styles.cardTitle}>{app.title || 'Untitled job'}</h3>
        {app.orgId && <p className={styles.cardOrg}>{orgName(app.orgId)}</p>}
        <div className={styles.cardMeta}>
          {app.location && <span>{app.location}</span>}
          {app.fitScore ? <Stars score={app.fitScore} /> : null}
        </div>
        {app.fitVerdict && (
          <div className={styles.cardFit}>
            <FitBadges fit={app.fitVerdict} />
          </div>
        )}
        {contacts.length > 0 && (
          <p className={styles.cardContacts}>
            ☺ {contacts.map(c => c.name).join(', ')}
          </p>
        )}
        {app.stage === 'Closed' && app.closeReason && (
          <p className={styles.cardCloseReason}>✕ {app.closeReason}</p>
        )}
      </button>
      <div className={styles.cardFooter}>
        <select
          className={styles.moveSelect}
          value={app.stage}
          onChange={e => onMove(e.target.value)}
          onClick={e => e.stopPropagation()}
          aria-label="Move to stage"
        >
          {STAGES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <ShareLink app={app} orgLabel={orgName(app.orgId)} />
      </div>
    </article>
  );
}

// --- List ------------------------------------------------------------------
function ListView({ onEdit }) {
  const { db, remove } = useDb();
  const { orgName } = useSelectors();
  const [sort, setSort] = useState({ key: 'updatedAt', dir: 'desc' });

  const sorted = [...db.apps].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const va = sortValue(a, sort.key, orgName);
    const vb = sortValue(b, sort.key, orgName);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  function toggleSort(key) {
    setSort(s =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  }

  const arrow = key => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th onClick={() => toggleSort('title')}>Title{arrow('title')}</th>
            <th onClick={() => toggleSort('org')}>Org{arrow('org')}</th>
            <th onClick={() => toggleSort('stage')}>Stage{arrow('stage')}</th>
            <th onClick={() => toggleSort('fit')}>Fit{arrow('fit')}</th>
            <th>Location</th>
            <th onClick={() => toggleSort('appliedDate')}>Applied{arrow('appliedDate')}</th>
            <th className={styles.actionsCol}></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(app => (
            <tr key={app.id} onClick={() => onEdit(app)} className={styles.row}>
              <td className={styles.roleCell}>{app.title || 'Untitled job'}</td>
              <td>{orgName(app.orgId)}</td>
              <td>
                <Badge tone={STAGE_TONE[app.stage]}>{app.stage}</Badge>
                {app.stage === 'Closed' && app.closeReason && (
                  <div className={styles.closeReason} title={app.closeReason}>
                    {app.closeReason}
                  </div>
                )}
              </td>
              <td>{app.fitVerdict ? <FitBadges fit={app.fitVerdict} /> : null}</td>
              <td>{app.location}</td>
              <td>{formatDate(app.appliedDate)}</td>
              <td className={styles.actionsCol} onClick={e => e.stopPropagation()}>
                <ShareLink app={app} orgLabel={orgName(app.orgId)} />
                <button
                  className="btn btn--ghost btn--sm btn--danger"
                  onClick={() => {
                    if (confirm(`Delete "${app.title || 'this job'}"?`)) {
                      remove('apps', app.id);
                    }
                  }}
                  title="Delete"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ACTION_RANK = { apply: 3, wait: 2, pass: 1 };
const FIT_RANK = { close: 3, partial: 2, miss: 1 };

function sortValue(app, key, orgName) {
  if (key === 'org') return orgName(app.orgId).toLowerCase();
  if (key === 'stage') return STAGES.indexOf(app.stage);
  if (key === 'title') return (app.title || '').toLowerCase();
  if (key === 'fit') {
    const v = app.fitVerdict;
    // Rank by recommended action first, then closeness; unscored sort last.
    return v ? (ACTION_RANK[v.action] || 0) * 10 + (FIT_RANK[v.fit] || 0) : 0;
  }
  return app[key] || '';
}

// --- Shared bits -----------------------------------------------------------
function Stars({ score }) {
  return (
    <span className={styles.stars} title={`Seniority/scope: ${score}/5`}>
      {'★'.repeat(score)}
      <span className={styles.starsDim}>{'★'.repeat(Math.max(0, 5 - score))}</span>
    </span>
  );
}

function ShareLink({ app, orgLabel }) {
  const [copied, setCopied] = useState(false);
  async function copy(e) {
    e.stopPropagation();
    const url = buildShareUrl(app, orgLabel);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this share link:', url);
    }
  }
  return (
    <button
      className="btn btn--ghost btn--sm"
      onClick={copy}
      title="Copy a read-only share link"
    >
      {copied ? '✓' : '🔗'}
    </button>
  );
}
