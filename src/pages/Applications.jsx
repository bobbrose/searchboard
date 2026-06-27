import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import { FitBadges } from '../components/FitVerdict.jsx';
import ApplicationForm from '../forms/ApplicationForm.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import { STAGES, exportAsFile, importFromFile, mergeDB } from '../lib/store.js';
import { hasCriteria } from '../lib/fit.js';
import { formatDate, today } from '../lib/dates.js';
import { withProtocol, displayUrl } from '../lib/website.js';
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
  const { orgName, contactLinksForApp } = useSelectors();
  const [view, setView] = useState('kanban'); // 'kanban' | 'list'
  const [editing, setEditing] = useState(null); // app record, {} for new, or null
  const [query, setQuery] = useState('');
  const fileRef = useRef(null);

  const hasApps = db.apps.length > 0;

  // Keyword filter: every whitespace-separated term must appear somewhere in a
  // job's searchable text (title, org, location, stage, comp, notes, contacts).
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleApps = terms.length
    ? db.apps.filter(a => {
        const hay = appHaystack(a, orgName, contactLinksForApp);
        return terms.every(t => hay.includes(t));
      })
    : db.apps;

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
            title="Save the current state of all your jobs and data to a JSON file — your backup for restoring later or moving to another browser."
          >
            ↓ Save to file
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => fileRef.current?.click()}
            title="Load jobs from a saved JSON file and merge them in — newer records win and nothing you already have is erased."
          >
            ↑ Load from file
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
        <>
          {!hasCriteria(db.profile) && (
            <Link to="/criteria" className={styles.criteriaCta}>
              <span>
                <strong>Set up your criteria</strong> so we can find jobs with the
                best fit.
              </span>
              <span className={styles.criteriaCtaArrow} aria-hidden="true">
                →
              </span>
            </Link>
          )}
          <EmptyState
            icon="▤"
            title="No jobs yet"
            hint="Add a job manually, or paste a job description and let it fill the fields in."
            action={
              <>
                <button className="btn btn--primary" onClick={() => setEditing({})}>
                  + Add your first job
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => fileRef.current?.click()}
                >
                  Load jobs from saved file
                </button>
              </>
            }
          />
        </>
      ) : (
        <>
          <div className={styles.searchBar}>
            <input
              type="search"
              className={styles.searchInput}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search jobs by title, org, location, contact…"
              aria-label="Search jobs"
            />
            {terms.length > 0 && (
              <span className={styles.searchCount}>
                {visibleApps.length} match{visibleApps.length === 1 ? '' : 'es'}
              </span>
            )}
          </div>
          {terms.length > 0 && visibleApps.length === 0 ? (
            <p className={styles.noResults}>No jobs match “{query.trim()}”.</p>
          ) : view === 'kanban' ? (
            <KanbanView
              apps={visibleApps}
              searching={terms.length > 0}
              onEdit={setEditing}
            />
          ) : (
            <ListView apps={visibleApps} onEdit={setEditing} />
          )}
        </>
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
function KanbanView({ apps: allApps, searching, onEdit }) {
  const { db, update } = useDb();
  // Closed jobs don't need pipeline prominence: pin the column to the far left
  // and collapse it by default so it sits out of the way until you want it.
  const [closedCollapsed, setClosedCollapsed] = useState(true);
  // Drag-and-drop between columns. `dragId` is the card in flight; `dragOver`
  // is the stage currently under the cursor (for the drop-target highlight).
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const order = ['Closed', ...STAGES.filter(s => s !== 'Closed')];

  // The one place a stage change happens, whether via the dropdown or a drop.
  function moveTo(app, stage) {
    if (!app || app.stage === stage) return;
    update('apps', app.id, {
      stage,
      // Stamp the applied date on first move into "Applied", without
      // clobbering a date already recorded.
      ...(stage === 'Applied' && !app.appliedDate ? { appliedDate: today() } : {})
    });
  }

  // Drop-target wiring shared by the normal and collapsed column shells.
  function dropProps(stage) {
    return {
      onDragOver: e => {
        if (!dragId) return; // ignore drags that didn't originate from a card
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOver !== stage) setDragOver(stage);
      },
      onDragLeave: e => {
        // Only clear when the cursor leaves the column, not a child element.
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
      },
      onDrop: e => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain') || dragId;
        moveTo(db.apps.find(a => a.id === id), stage);
        setDragOver(null);
        setDragId(null);
      }
    };
  }

  return (
    <div className={styles.board}>
      {order.map(stage => {
        // Most-recently-touched cards sit at the top of each column, so a job
        // you just added or just moved here is easy to find (updatedAt desc).
        const apps = allApps
          .filter(a => a.stage === stage)
          .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        const isClosed = stage === 'Closed';
        const overClass = dragOver === stage ? styles.columnDragOver : '';

        // While searching, keep Closed expanded so matches there are visible.
        if (isClosed && closedCollapsed && !searching) {
          return (
            <section
              key={stage}
              className={`${styles.column} ${styles.columnCollapsed} ${overClass}`}
              {...dropProps(stage)}
            >
              <button
                type="button"
                className={styles.collapsedBar}
                onClick={() => setClosedCollapsed(false)}
                aria-label={`Expand Closed (${apps.length} closed job${apps.length === 1 ? '' : 's'})`}
                aria-expanded="false"
              >
                <span className={styles.chevron} aria-hidden="true">▸</span>
                <span
                  className={styles.colCount}
                  title={`${apps.length} closed job${apps.length === 1 ? '' : 's'}`}
                >
                  {apps.length}
                </span>
              </button>
            </section>
          );
        }

        return (
          <section
            key={stage}
            className={`${styles.column} ${overClass}`}
            {...dropProps(stage)}
          >
            <header className={styles.colHeader}>
              <span className={styles.colHeadLeft}>
                {isClosed && (
                  <button
                    type="button"
                    className={styles.collapseBtn}
                    onClick={() => setClosedCollapsed(true)}
                    title="Collapse Closed"
                    aria-expanded="true"
                  >
                    ▾
                  </button>
                )}
                {stage}
              </span>
              <span className={styles.colCount}>{apps.length}</span>
            </header>
            <div className={styles.colBody}>
              {apps.map(app => (
                <AppCard
                  key={app.id}
                  app={app}
                  dragging={dragId === app.id}
                  onEdit={() => onEdit(app)}
                  onMove={s => moveTo(app, s)}
                  onDragStart={() => setDragId(app.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOver(null);
                  }}
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

function AppCard({ app, onEdit, onMove, dragging, onDragStart, onDragEnd }) {
  const { orgById, contactLinksForApp } = useSelectors();
  const org = app.orgId ? orgById(app.orgId) : null;
  const links = contactLinksForApp(app);
  const referrers = links.filter(l => l.relation === 'referrer');
  const others = links.filter(l => l.relation !== 'referrer');

  return (
    <article
      className={`${styles.card} ${dragging ? styles.cardDragging : ''}`}
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', app.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div
        className={styles.cardMain}
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEdit();
          }
        }}
      >
        <h3 className={styles.cardTitle}>{app.title || 'Untitled job'}</h3>
        {org && <p className={styles.cardOrg}>{org.name}</p>}
        {org?.website && (
          <a
            className={styles.cardUrl}
            href={withProtocol(org.website)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
          >
            {displayUrl(org.website)}
          </a>
        )}
        <div className={styles.cardMeta}>
          {app.location && <span>{app.location}</span>}
          {app.fitScore ? <Stars score={app.fitScore} /> : null}
        </div>
        {app.fitVerdict && (
          <div className={styles.cardFit}>
            <FitBadges fit={app.fitVerdict} />
          </div>
        )}
        {referrers.length > 0 && (
          <p className={styles.cardReferral}>
            ↳ Referred by {referrers.map(l => l.contact.name).join(', ')}
          </p>
        )}
        {others.length > 0 && (
          <p className={styles.cardContacts}>
            ☺ {others.map(l => l.contact.name).join(', ')}
          </p>
        )}
        {app.stage === 'Closed' && app.closeReason && (
          <p className={styles.cardCloseReason}>✕ {app.closeReason}</p>
        )}
      </div>
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
      </div>
    </article>
  );
}

// --- List ------------------------------------------------------------------
function ListView({ apps, onEdit }) {
  const { remove } = useDb();
  const { orgName, contactLinksForApp } = useSelectors();
  const [sort, setSort] = useState({ key: 'updatedAt', dir: 'desc' });

  const sorted = [...apps].sort((a, b) => {
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
              <td className={styles.roleCell}>
                {app.title || 'Untitled job'}
                {(() => {
                  const refs = contactLinksForApp(app).filter(
                    l => l.relation === 'referrer'
                  );
                  return refs.length ? (
                    <div className={styles.referralSub}>
                      ↳ Referred by {refs.map(l => l.contact.name).join(', ')}
                    </div>
                  ) : null;
                })()}
              </td>
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

// All the text a keyword search should match against, lowercased into one blob.
function appHaystack(app, orgName, contactLinksForApp) {
  return [
    app.title,
    orgName(app.orgId),
    app.location,
    app.stage,
    app.salary,
    app.fitNotes,
    app.closeReason,
    ...contactLinksForApp(app).map(l => l.contact.name)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
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

