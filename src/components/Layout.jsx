import { useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useDb, useSelectors } from '../lib/db.jsx';
import { isOverdue } from '../lib/dates.js';
import { exportAsFile, importFromFile } from '../lib/store.js';
import styles from './Layout.module.css';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '◧', end: true },
  { to: '/applications', label: 'Applications', icon: '▤' },
  { to: '/orgs', label: 'Orgs', icon: '◳' },
  { to: '/contacts', label: 'Contacts', icon: '☺' },
  { to: '/analysis', label: 'Analysis', icon: '✎' },
  { to: '/todos', label: 'Action Items', icon: '◎' },
  { to: '/settings', label: 'Settings', icon: '⚙' }
];

export default function Layout() {
  const { db, replaceAll } = useDb();
  const { openTodos } = useSelectors();
  const [navOpen, setNavOpen] = useState(false);
  const fileRef = useRef(null);

  async function onImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const next = await importFromFile(file);
      const total =
        next.apps.length + next.orgs.length + next.contacts.length +
        next.analyses.length + next.todos.length;
      if (
        confirm(
          `Import will replace your current data (${db.apps.length} apps, ${db.contacts.length} contacts, …) with the file's contents (${total} records total). Continue?`
        )
      ) {
        replaceAll(next);
      }
    } catch (err) {
      alert(err.message || 'Import failed.');
    } finally {
      e.target.value = ''; // allow re-importing the same file
    }
  }

  // Badge counts shown next to nav items.
  const overdueCount = openTodos().filter(t => isOverdue(t.dueDate)).length;
  const counts = {
    '/applications': db.apps.length,
    '/orgs': db.orgs.length,
    '/contacts': db.contacts.length,
    '/analysis': db.analyses.length,
    '/todos': openTodos().length
  };

  return (
    <div className={styles.shell}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setNavOpen(o => !o)}
        aria-label="Toggle navigation"
      >
        ☰
      </button>

      <aside className={`${styles.nav} ${navOpen ? styles.navOpen : ''}`}>
        <div className={styles.brand}>
          <span className={styles.logo}>◆</span>
          <span>Searchboard</span>
        </div>
        <nav className={styles.navList}>
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.navIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span className={styles.navLabel}>{item.label}</span>
              {item.to === '/todos' && overdueCount > 0 ? (
                <span className={`${styles.count} ${styles.countAlert}`}>
                  {overdueCount}
                </span>
              ) : counts[item.to] ? (
                <span className={styles.count}>{counts[item.to]}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className={styles.dataActions}>
          <button
            type="button"
            className={styles.dataBtn}
            onClick={() => exportAsFile(db)}
            title="Download all data as a JSON file"
          >
            <span aria-hidden="true">↓</span> Export
          </button>
          <button
            type="button"
            className={styles.dataBtn}
            onClick={() => fileRef.current?.click()}
            title="Replace all data from a JSON file"
          >
            <span aria-hidden="true">↑</span> Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onImport}
            className={styles.hiddenInput}
          />
        </div>

        <div className={styles.footnote}>Local-first · your data stays here</div>
      </aside>

      {navOpen && (
        <div
          className={styles.scrim}
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
