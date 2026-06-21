import { useState } from 'react';
import { useDb } from '../lib/db.jsx';
import styles from './RefineCriteria.module.css';

// Inline "refine my criteria" attached to a fit verdict. The most valuable of
// the three capture paths (spec Part 2.3): when a verdict prompts a reaction
// ("steer me toward product roles, not infra"), one click captures it without a
// trip to Settings. Appends a timestamped line to softPreferences.notes, then
// optionally re-scores via onRefined.
export default function RefineCriteria({ onRefined }) {
  const { db, setProfile } = useDb();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  function submit() {
    const note = text.trim();
    if (!note) return;
    const soft = db.profile?.softPreferences || {};
    const stamp = new Date().toISOString().slice(0, 10);
    const line = `[${stamp}] ${note}`;
    setProfile({
      softPreferences: {
        ...soft,
        notes: soft.notes ? `${soft.notes}\n${line}` : line
      }
    });
    setText('');
    setOpen(false);
    onRefined?.();
  }

  if (!open) {
    return (
      <button
        type="button"
        className={`btn btn--ghost btn--sm ${styles.trigger}`}
        onClick={() => setOpen(true)}
      >
        ✎ Refine my criteria
      </button>
    );
  }

  return (
    <div className={styles.box}>
      <textarea
        className={styles.input}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="e.g. Steer me toward product roles, not infra."
        rows={2}
        autoFocus
      />
      <div className={styles.actions}>
        <button type="button" className="btn btn--sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={submit}
          disabled={!text.trim()}
        >
          Save & re-score
        </button>
      </div>
    </div>
  );
}
