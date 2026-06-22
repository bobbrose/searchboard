import { useSearchParams, Link } from 'react-router-dom';
import { decodeShareableApp } from '../lib/store.js';
import styles from './SharedRole.module.css';

// Standalone, read-only view rendered when someone opens a "Share this role"
// link. The role data lives entirely in the ?role= query param (see
// lib/share.js) — no server storage, nothing fetched, no private notes.
export default function SharedRole() {
  const [params] = useSearchParams();
  const encoded = params.get('role');
  const role = encoded ? decodeShareableApp(encoded) : null;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link to="/" className={styles.brand}>
          <span className={styles.logo}>◆</span> Searchboard
        </Link>
        <span className={styles.tag}>Shared job</span>
      </header>

      {!role || !role.title ? (
        <div className={styles.card}>
          <h1 className={styles.errorTitle}>This link couldn't be read</h1>
          <p className={styles.errorBody}>
            The shared job data is missing or malformed. Ask whoever sent it for
            a fresh link.
          </p>
          <Link className="btn btn--primary" to="/">
            Go to Searchboard
          </Link>
        </div>
      ) : (
        <div className={styles.card}>
          <h1 className={styles.title}>{role.title}</h1>
          <p className={styles.sub}>
            {role.orgName && <span className={styles.org}>{role.orgName}</span>}
            {role.orgName && role.location && <span className={styles.dot}>·</span>}
            {role.location && <span>{role.location}</span>}
          </p>

          {role.fitScore ? (
            <div className={styles.scoreRow}>
              <span className={styles.scoreLabel}>Seniority / scope</span>
              <span className={styles.stars}>
                {'★'.repeat(role.fitScore)}
                <span className={styles.starsDim}>
                  {'★'.repeat(Math.max(0, 5 - role.fitScore))}
                </span>
              </span>
            </div>
          ) : null}

          {role.fitNotes && (
            <>
              <h2 className={styles.sectionLabel}>About the job</h2>
              <p className={styles.notes}>{role.fitNotes}</p>
            </>
          )}

          {role.link && (
            <a
              className="btn btn--primary"
              href={role.link}
              target="_blank"
              rel="noreferrer"
            >
              View original posting →
            </a>
          )}

          <p className={styles.footnote}>
            Shared from a Searchboard pipeline.{' '}
            <Link to="/">Track your own search →</Link>
          </p>
        </div>
      )}
    </div>
  );
}
