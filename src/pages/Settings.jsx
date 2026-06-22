import { useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { useDb } from '../lib/db.jsx';
import {
  exportAsFile,
  importFromFile,
  mergeDB,
  emptyDB,
  canUseParseToday
} from '../lib/store.js';
import { formatDate } from '../lib/dates.js';
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
    ['Jobs', db.apps.length],
    ['Orgs', db.orgs.length],
    ['Contacts', db.contacts.length],
    ['Analysis entries', db.analyses.length],
    ['Action items', db.todos.length]
  ];

  // Merge-load: newer records win, nothing is erased — same behavior as the
  // Jobs page. Wiping is only ever done explicitly via "Clear all data".
  const COLLECTIONS = ['apps', 'orgs', 'contacts', 'analyses', 'todos'];
  async function onImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const incoming = await importFromFile(file);
      const merged = mergeDB(db, incoming);
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
        setMsg({ tone: 'ok', text: "Already up to date — nothing to merge." });
        return;
      }
      if (
        !confirm(
          `Merge ${incomingTotal} record(s) from this file into your data?\n\n` +
            `• ${added} new record(s) added\n` +
            `• ${updated} matched existing record(s) (newer version kept)\n\n` +
            `Your current data is not erased.`
        )
      ) {
        return;
      }
      replaceAll(merged);
      setMsg({ tone: 'ok', text: 'Data loaded and merged successfully.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: err.message || 'Load failed.' });
    } finally {
      e.target.value = ''; // allow re-loading the same file
    }
  }

  function onClear() {
    if (
      !confirm(
        'Clear ALL data from this browser? Save to a file first if you want a backup — this cannot be undone.'
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
          Everything lives in this browser and in the JSON file you save. No
          account, no server-side storage. Save to a file to back up or move to
          another device; load it to resume.
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
          <button
            className="btn btn--primary"
            onClick={() => exportAsFile(db)}
            title="Save the current state of all your data to a JSON file for backup or restoring later."
          >
            ↓ Save to file
          </button>
          <button
            className="btn"
            onClick={() => fileRef.current?.click()}
            title="Load jobs from a saved JSON file and merge them in — newer records win and nothing you already have is erased. To wipe everything, use Clear all data."
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
          <button className="btn btn--danger" onClick={onClear}>
            Clear all data
          </button>
        </div>
      </section>

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
            Your allowance resets tomorrow. You can still add jobs manually any time.
          </p>
        )}
      </section>
    </>
  );
}
