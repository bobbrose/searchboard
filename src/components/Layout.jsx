import { useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useDb, useSelectors } from '../lib/db.jsx';
import { isOverdue } from '../lib/dates.js';
import { exportAsFile, importFromFile, mergeDB } from '../lib/store.js';
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
      // mergeDB keeps element references (and order) for records it didn't
      // change, so a real change means a differing length or a swapped item.
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
            title="Merge data from a JSON file (newer records win; nothing erased)"
          >
            <span aria-hidden="true">↑</span> Merge
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
