import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import ProfileSetup from '../components/ProfileSetup.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import { STAGES } from '../lib/store.js';
import { hasCriteria } from '../lib/fit.js';
import { byUrgency, dueLabel, isOverdue, formatDate } from '../lib/dates.js';
import styles from './Dashboard.module.css';

const SETUP_DISMISSED_KEY = 'searchboard_profile_setup_dismissed_v1';

const STAGE_TONE = {
  Researching: 'neutral',
  Applied: 'accent',
  Interviewing: 'warm',
  Offer: 'ok',
  Closed: 'done'
};

export default function Dashboard() {
  const { db } = useDb();
  const [setupOpen, setSetupOpen] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(SETUP_DISMISSED_KEY) === '1'
  );
  const isEmpty =
    db.apps.length === 0 &&
    db.orgs.length === 0 &&
    db.contacts.length === 0 &&
    db.analyses.length === 0 &&
    db.todos.length === 0;

  // Nudge first-run users to set up criteria, but only once they've started
  // using the tool (not on the empty welcome screen), and never after dismissal.
  const showSetupBanner = !isEmpty && !dismissed && !hasCriteria(db.profile);

  function dismissBanner() {
    localStorage.setItem(SETUP_DISMISSED_KEY, '1');
    setDismissed(true);
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your search at a glance" />

      {showSetupBanner && (
        <div className={styles.setupBanner}>
          <div>
            <strong>Personalize your fit scoring.</strong>{' '}
            <span className={styles.setupHint}>
              Set your target roles, comp floor, and deal-breakers — and every
              role you paste gets scored against them.
            </span>
          </div>
          <div className={styles.setupActions}>
            <button className="btn btn--sm btn--primary" onClick={() => setSetupOpen(true)}>
              Set up criteria
            </button>
            <button className="btn btn--ghost btn--sm" onClick={dismissBanner}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {setupOpen && <ProfileSetup onClose={() => setSetupOpen(false)} />}

      {isEmpty ? (
        <EmptyState
          icon="◧"
          title="Welcome to Searchboard"
          hint="Start by adding an application or pasting a job description. Everything else — orgs, contacts, analysis, action items — links back to your pipeline."
          action={
            <Link className="btn btn--primary" to="/applications">
              + Add your first application
            </Link>
          }
        />
      ) : (
        <div className={styles.grid}>
          <Funnel />
          <ActionItemsPanel />
          <RecentActivity />
        </div>
      )}
    </>
  );
}

// --- Pipeline funnel -------------------------------------------------------
function Funnel() {
  const { db } = useDb();
  const counts = STAGES.map(stage => ({
    stage,
    n: db.apps.filter(a => a.stage === stage).length
  }));
  const max = Math.max(1, ...counts.map(c => c.n));

  return (
    <section className={`${styles.panel} ${styles.funnelPanel}`}>
      <div className={styles.panelHead}>
        <h2>Pipeline</h2>
        <Link to="/applications" className={styles.seeAll}>
          {db.apps.length} total →
        </Link>
      </div>
      <div className={styles.funnel}>
        {counts.map(({ stage, n }) => (
          <div key={stage} className={styles.funnelRow}>
            <span className={styles.funnelLabel}>{stage}</span>
            <div className={styles.barTrack}>
              <div
                className={`${styles.bar} ${styles[`bar_${STAGE_TONE[stage]}`]}`}
                style={{ width: `${(n / max) * 100}%` }}
              />
            </div>
            <span className={styles.funnelCount}>{n}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- Action items panel (overdue + upcoming) -------------------------------
function ActionItemsPanel() {
  const { db } = useDb();
  const navigate = useNavigate();
  const open = db.todos.filter(t => !t.done).sort(byUrgency).slice(0, 6);
  const overdueCount = db.todos.filter(t => !t.done && isOverdue(t.dueDate)).length;

  return (
    <section className={`${styles.panel} ${styles.actionPanel}`}>
      <div className={styles.panelHead}>
        <h2>
          Action items
          {overdueCount > 0 && (
            <Badge tone="overdue" title="Overdue">
              {overdueCount} overdue
            </Badge>
          )}
        </h2>
        <Link to="/todos" className={styles.seeAll}>
          All →
        </Link>
      </div>
      {open.length === 0 ? (
        <p className={styles.allClear}>✓ Nothing open. Nice.</p>
      ) : (
        <ul className={styles.todoList}>
          {open.map(todo => {
            const overdue = isOverdue(todo.dueDate);
            return (
              <li
                key={todo.id}
                className={`${styles.todoItem} ${overdue ? styles.todoOverdue : ''}`}
                onClick={() => navigate('/todos')}
              >
                <span className={styles.todoTitle}>{todo.title || 'Untitled'}</span>
                <Badge tone={overdue ? 'overdue' : 'neutral'} title={formatDate(todo.dueDate)}>
                  {dueLabel(todo.dueDate)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// --- Recent activity -------------------------------------------------------
function RecentActivity() {
  const { db } = useDb();
  const { orgName } = useSelectors();
  const navigate = useNavigate();

  const META = {
    apps: { icon: '▤', to: '/applications', label: r => r.title || 'Untitled role' },
    orgs: { icon: '◳', to: '/orgs', label: r => r.name || 'Untitled org' },
    contacts: { icon: '☺', to: '/contacts', label: r => r.name || 'Unnamed contact' },
    analyses: { icon: '✎', to: '/analysis', label: r => r.title || 'Untitled entry' },
    todos: { icon: '◎', to: '/todos', label: r => r.title || 'Untitled item' }
  };

  // Flatten all records, tag with their collection, sort by updatedAt desc.
  const recent = Object.keys(META)
    .flatMap(coll => db[coll].map(r => ({ coll, r })))
    .sort((a, b) => (b.r.updatedAt || '').localeCompare(a.r.updatedAt || ''))
    .slice(0, 7);

  return (
    <section className={`${styles.panel} ${styles.recentPanel}`}>
      <div className={styles.panelHead}>
        <h2>Recent activity</h2>
      </div>
      <ul className={styles.recentList}>
        {recent.map(({ coll, r }) => {
          const m = META[coll];
          return (
            <li
              key={`${coll}-${r.id}`}
              className={styles.recentItem}
              onClick={() => navigate(m.to)}
            >
              <span className={styles.recentIcon}>{m.icon}</span>
              <span className={styles.recentLabel}>{m.label(r)}</span>
              <span className={styles.recentDate}>{formatDate(r.updatedAt)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
