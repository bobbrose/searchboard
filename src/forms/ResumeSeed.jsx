import { useState } from 'react';
import { useDb } from '../lib/db.jsx';
import { canUseToday, recordUse } from '../lib/store.js';
import { hasCriteria } from '../lib/fit.js';
import { formatDate } from '../lib/dates.js';
import styles from './SearchCriteria.module.css';

// "Seed from your résumé" — pastes résumé text, extracts the fields a résumé can
// honestly support (titles, differentiators, location, a background note), and
// merges them into the profile for review. Forward-looking preferences (comp,
// deal-breakers) are still set by hand below. Text-only for now.
export default function ResumeSeed() {
  const { db, setProfile } = useDb();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | error | done
  const [error, setError] = useState('');
  const canUse = canUseToday('resume');
  // Persisted marker (survives refresh), so the "seeded" confirmation isn't
  // just transient component state.
  const seededAt = db.profile?.resumeSeededAt;

  async function seed() {
    if (!text.trim()) return;
    // Seeding replaces existing criteria — confirm before discarding them.
    if (
      hasCriteria(db.profile) &&
      !confirm(
        'Seeding from a résumé replaces your current Fit Criteria (comp floor, deal-breakers, preferences, and all) with what we parse from this résumé. Continue?'
      )
    ) {
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setError(data.error || 'Could not read that résumé. Enter criteria manually.');
        return;
      }
      recordUse('resume');
      applyResume(data, setProfile);
      setStatus('done');
      setOpen(false);
      setText('');
    } catch {
      setStatus('error');
      setError('Network error. Enter your criteria manually.');
    }
  }

  if (!open) {
    return (
      <div className={styles.seedPrompt}>
        <div>
          <strong>New here?</strong>{' '}
          <span className={styles.seedHint}>
            Paste your résumé and we'll pre-fill titles, strengths, and location
            — you add the rest.
          </span>
        </div>
        <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>
          {seededAt ? '✦ Re-seed from résumé' : '✦ Seed from résumé'}
        </button>
        {seededAt && (
          <span className={styles.seedDone}>
            ✓ Seeded from your résumé ({formatDate(seededAt)}) — review below.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={styles.seedPanel}>
      <textarea
        className={styles.area}
        rows={8}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste your résumé text here…"
        autoFocus
      />
      {error && <p className={styles.seedError}>{error}</p>}
      {!canUse && (
        <p className={styles.seedError}>
          Daily résumé-parsing limit reached on the shared AI key — resets tomorrow.
        </p>
      )}
      <div className={styles.seedActions}>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            setOpen(false);
            setError('');
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={seed}
          disabled={!text.trim() || status === 'loading' || !canUse}
        >
          {status === 'loading' ? 'Reading…' : 'Seed criteria'}
        </button>
      </div>
    </div>
  );
}

// Seeding is a fresh start: REPLACE all criteria with what the résumé yields,
// clearing anything previously set (comp floor, deal-breakers, preferences…).
// Empty objects for hardFilters/softPreferences wipe their nested fields.
function applyResume(data, setProfile) {
  setProfile({
    targetTitles: data.targetTitles || [],
    differentiators: data.differentiators || [],
    redFlagPatterns: [],
    homeState: data.homeState || '',
    hardFilters: {},
    softPreferences: { notes: data.background || '' },
    resumeSeededAt: new Date().toISOString()
  });
}
