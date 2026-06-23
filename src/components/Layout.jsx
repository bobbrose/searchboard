import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import styles from './Layout.module.css';

// Secondary destinations live behind the hamburger; Applications is the home
// screen and renders full-width below the top bar.
const NAV = [
  { to: '/orgs', label: 'Orgs', icon: '◳' },
  { to: '/contacts', label: 'Contacts', icon: '☺' },
  { to: '/criteria', label: 'Fit Criteria', icon: '◎' },
  { to: '/settings', label: 'Settings', icon: '⚙' }
];

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          ☰
        </button>
        <NavLink
          to="/"
          className={styles.brand}
          onClick={() => setMenuOpen(false)}
        >
          <span className={styles.logo} aria-hidden="true">
            ◆
          </span>
          <span>Searchboard</span>
        </NavLink>
      </header>

      <aside className={`${styles.drawer} ${menuOpen ? styles.drawerOpen : ''}`}>
        <nav className={styles.navList}>
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <span className={styles.navIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={styles.footnote}>Local-first · your data stays here</div>
      </aside>

      {menuOpen && (
        <div
          className={styles.scrim}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className={styles.main}>
        <Outlet />
      </main>

      {/* Mounts once for the whole app; collects anonymous page-view metrics
          (no PII). Active only on the Vercel deployment with Analytics enabled. */}
      <Analytics />
    </div>
  );
}
