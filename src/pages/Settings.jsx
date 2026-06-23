import { useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Badge from '../components/Badge.jsx';
import { useDb } from '../lib/db.jsx';
import {
  exportAsFile,
  importFromFile,
  mergeDB,
  emptyDB,
  canUseParseToday,
  usedToday,
  dailyLimit,
  tokenUsage,
  clearTokenUsage,
  TOKEN_PRICING
} from '../lib/store.js';
import { formatDate } from '../lib/dates.js';
import styles from './Settings.module.css';

export default function Settings() {
  const { db, replaceAll } = useDb();
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null); // { tone, text }
  const [usage, setUsage] = useState(() => tokenUsage());

  // The token-usage panel is a personal diagnostic, not something other users
  // need — keep it out of the normal view. Opt in with ?showusage in the URL.
  const showUsage = new URLSearchParams(window.location.search).has('showusage');

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

  const used = usedToday('parse');
  const limit = dailyLimit('parse');
  const available = canUseParseToday();

  // Per-browser token tally across the shared AI endpoints. The Anthropic
  // Console is authoritative for true spend; this is a local at-a-glance read.
  const USAGE_LABELS = {
    parse: 'Job parsing',
    score: 'Fit scoring',
    resume: 'Résumé seeding',
    website: 'Website lookup',
    org: 'Org lookup'
  };
  const usageRows = Object.entries(USAGE_LABELS)
    .map(([bucket, label]) => ({ bucket, label, ...(usage[bucket] || {}) }))
    .filter(r => r.calls);
  const totals = usageRows.reduce(
    (t, r) => ({
      calls: t.calls + (r.calls || 0),
      input: t.input + (r.input || 0),
      output: t.output + (r.output || 0)
    }),
    { calls: 0, input: 0, output: 0 }
  );
  const estCost =
    totals.input * TOKEN_PRICING.input + totals.output * TOKEN_PRICING.output;
  const num = n => (n || 0).toLocaleString();

  function onResetUsage() {
    clearTokenUsage();
    setUsage({});
  }

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
          The “paste a job description” feature uses a shared, rate-limited AI key.
          There's a daily cap per browser so the shared key stays affordable for everyone.
        </p>
        <div className={styles.parseStatus}>
          <span>
            <strong>{used}</strong> of {limit} parse{limit === 1 ? '' : 's'} used today
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

        {showUsage && (
          <>
            <h3 className={styles.subhead}>Token usage from this browser</h3>
            {usageRows.length === 0 ? (
              <p className={styles.note}>
                No AI calls recorded yet. Counts appear here once you parse a
                job, score a fit, or seed from a résumé.
              </p>
            ) : (
              <>
                <table className={styles.usageTable}>
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Calls</th>
                      <th>Input</th>
                      <th>Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageRows.map(r => (
                      <tr key={r.bucket}>
                        <td>{r.label}</td>
                        <td>{num(r.calls)}</td>
                        <td>{num(r.input)}</td>
                        <td>{num(r.output)}</td>
                      </tr>
                    ))}
                    <tr className={styles.usageTotal}>
                      <td>Total</td>
                      <td>{num(totals.calls)}</td>
                      <td>{num(totals.input)}</td>
                      <td>{num(totals.output)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className={styles.note}>
                  Roughly <strong>${estCost.toFixed(2)}</strong> at list pricing
                  — a local estimate only. The Anthropic Console is the source of
                  truth for spend across everyone using the shared key.{' '}
                  <button className={styles.linkBtn} onClick={onResetUsage}>
                    Reset counts
                  </button>
                </p>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
