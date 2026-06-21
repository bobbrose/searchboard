import { useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { useDb } from '../lib/db.jsx';
import {
  exportAsFile,
  importFromFile,
  emptyDB,
  canUseParseToday
} from '../lib/store.js';
import { formatDate } from '../lib/dates.js';
import SearchCriteria from '../forms/SearchCriteria.jsx';
import styles from './Settings.module.css';

// Mirrors the (unexported) storage key in store.js so we can *display* today's
// parse usage. Read-only — the counter itself is owned by store.js.
const PARSE_LIMIT_KEY = 'searchboard_parse_count_v1';

function parsesUsedToday() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(PARSE_LIMIT_KEY);
    if (!raw) return 0;
    const rec = JSON.parse(raw);
    return rec.date === today ? rec.count : 0;
  } catch {
    return 0;
  }
}

export default function Settings() {
  const { db, replaceAll } = useDb();
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null); // { tone, text }

  const counts = [
    ['Applications', db.apps.length],
    ['Orgs', db.orgs.length],
    ['Contacts', db.contacts.length],
    ['Analysis entries', db.analyses.length],
    ['Action items', db.todos.length]
  ];

  async function onImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const next = await importFromFile(file);
      const total =
        next.apps.length + next.orgs.length + next.contacts.length +
        next.analyses.length + next.todos.length;
      if (
        !confirm(
          `Import will replace your current data (${db.apps.length} apps, ${db.contacts.length} contacts, …) with the file's contents (${total} records total). Continue?`
        )
      ) {
        return;
      }
      replaceAll(next);
      setMsg({ tone: 'ok', text: 'Data imported successfully.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: err.message || 'Import failed.' });
    } finally {
      e.target.value = ''; // allow re-importing the same file
    }
  }

  function onClear() {
    if (
      !confirm(
        'Clear ALL data from this browser? Export first if you want a backup — this cannot be undone.'
      )
    ) {
      return;
    }
    replaceAll(emptyDB());
    setMsg({ tone: 'danger', text: 'All data cleared.' });
  }

  const used = parsesUsedToday();
  const available = canUseParseToday();

  return (
    <>
      <PageHeader title="Settings" subtitle="Your data, your file." />

      {msg && (
        <div className={`${styles.toast} ${styles[msg.tone]}`} role="status">
          {msg.text}
        </div>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Your data</h2>
        <p className={styles.lead}>
          Everything lives in this browser and in the JSON file you export. No
          account, no server-side storage. Export to back up or move to another
          device; import to resume.
        </p>

        <div className={styles.statRow}>
          {counts.map(([label, n]) => (
            <div key={label} className={styles.stat}>
              <span className={styles.statNum}>{n}</span>
              <span className={styles.statLabel}>{label}</span>
            </div>
          ))}
        </div>
        {db.lastSaved && (
          <p className={styles.lastSaved}>Last change: {formatDate(db.lastSaved)}</p>
        )}

        <div className={styles.actions}>
          <button className="btn btn--primary" onClick={() => exportAsFile(db)}>
            ↓ Export JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            ↑ Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onImport}
            className={styles.hiddenInput}
          />
          <button className="btn btn--danger" onClick={onClear}>
            Clear all data
          </button>
        </div>
      </section>

      <SearchCriteria />

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Shared AI parsing</h2>
        <p className={styles.lead}>
          The “paste a job description” feature uses a shared, rate-limited AI key
          (see VISION). There's a daily cap per browser so the shared key stays
          affordable for everyone.
        </p>
        <div className={styles.parseStatus}>
          <span>
            <strong>{used}</strong> parse{used === 1 ? '' : 's'} used today
          </span>
          <Badge tone={available ? 'ok' : 'overdue'}>
            {available ? 'Available' : 'Daily limit reached'}
          </Badge>
        </div>
        {!available && (
          <p className={styles.note}>
            Your allowance resets tomorrow. You can still add roles manually any time.
          </p>
        )}
      </section>
    </>
  );
}
