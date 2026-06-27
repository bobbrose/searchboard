import { useEffect, useState } from 'react';
import TagInput from '../components/TagInput.jsx';
import ResumeSeed from './ResumeSeed.jsx';
import { useDb } from '../lib/db.jsx';
import { COMPANY_DIMENSIONS, PRODUCT_INFRA_OPTIONS, FIT_LEVELS } from '../lib/fit.js';
import styles from './SearchCriteria.module.css';

// The living criteria profile — source of truth, edited any time in Settings.
// Saves live via setProfile (same pattern as the homeState field). Nested
// objects (hardFilters/softPreferences) are read-modify-written whole, since
// setProfile only shallow-merges the top level.
//
// `embedded` drops the outer <section> chrome so the first-run wizard can reuse
// the exact same fields.
export default function SearchCriteria({ embedded = false }) {
  const { db, setProfile } = useDb();
  const p = db.profile || {};
  const hard = p.hardFilters || {};
  const soft = p.softPreferences || {};

  const setHard = patch =>
    setProfile({ hardFilters: { ...hard, ...patch } });
  const setSoft = patch =>
    setProfile({ softPreferences: { ...soft, ...patch } });

  // A number field that stores null when cleared (vs. 0).
  const numOrNull = v => {
    const t = v.trim();
    return t === '' ? null : Number(t);
  };

  const body = (
    <>
      <ResumeSeed />

      <Group
        label="Home state / location"
        hint="Tailors salary extraction to your region-specific pay band."
      >
        <input
          type="text"
          className={styles.short}
          value={p.homeState || ''}
          onChange={e => setProfile({ homeState: e.target.value })}
          placeholder="e.g. CO"
          maxLength={40}
        />
      </Group>

      <Group
        label="Target titles"
        hint="The roles you're actually after. Enter or comma to add."
      >
        <TagInput
          value={p.targetTitles || []}
          onChange={v => setProfile({ targetTitles: v })}
          placeholder="e.g. Director of Product, Senior Designer, VP of Marketing…"
        />
      </Group>

      <h3 className={styles.subhead}>Hard filters</h3>
      <p className={styles.subhint}>
        Deal-breakers. Checked instantly in your browser before any AI call — a
        job that trips one is marked “Pass” for free, no tokens spent.
      </p>

      <div className={styles.row}>
        <Group label="Comp floor (USD base)">
          <input
            type="number"
            className={styles.short}
            value={hard.compFloor ?? ''}
            onChange={e => setHard({ compFloor: numOrNull(e.target.value) })}
            placeholder="225000"
            min="0"
            step="1000"
          />
        </Group>
        <Group label="Remote required">
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={!!hard.remoteRequired}
              onChange={e => setHard({ remoteRequired: e.target.checked })}
            />
            <span>Only consider remote roles</span>
          </label>
        </Group>
      </div>

      <Group label="Excluded domains" hint="Keywords that disqualify a job.">
        <TagInput
          value={hard.domainExclusions || []}
          onChange={v => setHard({ domainExclusions: v })}
          placeholder="martech, crypto, notifications…"
        />
      </Group>

      <Group
        label="Qualifiers / exceptions"
        hint="Optional freeform nuance the binary filters above can't capture."
      >
        <textarea
          className={styles.area}
          rows={2}
          value={hard.notes || ''}
          onChange={e => setHard({ notes: e.target.value })}
          placeholder="e.g. Comp floor is flexible if equity is strong; open to hybrid for an exceptional team."
        />
      </Group>

      <h3 className={styles.subhead}>Preferences</h3>
      <p className={styles.subhint}>
        Judgment calls the AI weighs when scoring — not pattern-matched by code.
      </p>

      <Group
        label="Product vs. infra orientation"
        hint="Tap again to clear."
      >
        <div className={styles.chips}>
          {PRODUCT_INFRA_OPTIONS.map(o => {
            const selected = soft.productVsInfra === o.value;
            return (
              <button
                key={o.value}
                type="button"
                className={`${styles.chip} ${selected ? styles.chipOn : ''}`}
                aria-pressed={selected}
                onClick={() =>
                  setSoft({ productVsInfra: selected ? '' : o.value })
                }
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </Group>

      <Group
        label="Preferred company attributes"
        hint="Pick any that matter in each dimension."
      >
        <div className={styles.dimensions}>
          {COMPANY_DIMENSIONS.map(dim => (
            <div key={dim.label} className={styles.dimension}>
              <span className={styles.dimLabel}>{dim.label}</span>
              <div className={styles.chips}>
                {dim.options.map(attr => {
                  const selected = (soft.companyAttributes || []).includes(attr);
                  return (
                    <button
                      key={attr}
                      type="button"
                      className={`${styles.chip} ${selected ? styles.chipOn : ''}`}
                      aria-pressed={selected}
                      onClick={() =>
                        setSoft({
                          companyAttributes: selected
                            ? (soft.companyAttributes || []).filter(a => a !== attr)
                            : [...(soft.companyAttributes || []), attr]
                        })
                      }
                    >
                      {attr}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Group>

      <Group
        label="Notes"
        hint="Freeform context. Also where inline refinements from fit verdicts land."
      >
        <textarea
          className={styles.area}
          rows={3}
          value={soft.notes || ''}
          onChange={e => setSoft({ notes: e.target.value })}
          placeholder="Anything else that shapes what you want next."
        />
      </Group>

      <Group
        label="Differentiators"
        hint="What makes you a strong candidate — one per line. Doubles as cover-letter hook material."
      >
        <LinesField
          value={p.differentiators}
          onChange={v => setProfile({ differentiators: v })}
          placeholder={'e.g. Grew revenue 40% in two years\nBuilt and led a 20-person team'}
        />
      </Group>

      <Group
        label="Red-flag patterns"
        hint="Patterns to watch for in JD language — one per line. Not keyword matches."
      >
        <LinesField
          value={p.redFlagPatterns}
          onChange={v => setProfile({ redFlagPatterns: v })}
          placeholder={'e.g. Vague scope or shifting priorities\nTitle inflation without real authority'}
        />
      </Group>

      {p.fitCalibration?.length > 0 && (
        <Group
          label="Calibration"
          hint="Corrections you've made to fit verdicts. The scorer uses your most recent few to match your bar. Remove any that no longer reflect how you judge."
        >
          <ul className={styles.calibList}>
            {p.fitCalibration.map(c => (
              <li key={c.id} className={styles.calibItem}>
                <span className={styles.calibText}>
                  <strong>{c.digest}</strong> → you set{' '}
                  {FIT_LEVELS[c.correct?.fit]?.label || c.correct?.fit}
                  {c.note ? ` — ${c.note}` : ''}
                </span>
                <button
                  type="button"
                  className={styles.calibRemove}
                  onClick={() =>
                    setProfile({
                      fitCalibration: p.fitCalibration.filter(x => x.id !== c.id)
                    })
                  }
                  title="Remove this calibration"
                  aria-label="Remove this calibration"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </>
  );

  if (embedded) return body;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Fit Criteria</h2>
      <p className={styles.lead}>
        What you want next. Each job you add is scored on how closely it{' '}
        <em>fits these criteria</em> — not a judgment of you or the job, just
        the overlap, and why. Hard filters are checked in your browser (no AI
        call); preferences guide the AI's read. Sent only transiently when
        scoring, never stored. Round-trips through Export / Import.
      </p>
      {body}
    </section>
  );
}

// Split a textarea into trimmed, non-empty lines for an array field.
function splitLines(text) {
  return text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

// A textarea bound to an array of lines. Crucially it keeps the *raw* text in
// local state while typing — cleaning into the array (trim + drop blanks) only
// for storage — so in-progress whitespace and newlines aren't stripped on every
// keystroke. Resyncs if the external array changes (e.g. a résumé re-seed).
function LinesField({ value, onChange, ...props }) {
  const [raw, setRaw] = useState(() => (value || []).join('\n'));

  useEffect(() => {
    const external = (value || []).join('\n');
    if (splitLines(raw).join('\n') !== external) setRaw(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <textarea
      {...props}
      className={styles.area}
      rows={3}
      value={raw}
      onChange={e => {
        setRaw(e.target.value);
        onChange(splitLines(e.target.value));
      }}
    />
  );
}

function Group({ label, hint, children }) {
  return (
    <div className={styles.group}>
      <label className={styles.label}>{label}</label>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}
