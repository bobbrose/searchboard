import TagInput from '../components/TagInput.jsx';
import { useDb } from '../lib/db.jsx';
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
          placeholder="Senior Engineering Manager, Director of Engineering…"
        />
      </Group>

      <h3 className={styles.subhead}>Hard filters</h3>
      <p className={styles.subhint}>
        Deal-breakers. Checked instantly in your browser before any AI call — a
        role that trips one is marked “Pass” for free, no tokens spent.
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
        <Group label="Max IC-coding %" hint="Leave blank for no ceiling.">
          <input
            type="number"
            className={styles.short}
            value={hard.maxIcCodingPercent ?? ''}
            onChange={e =>
              setHard({ maxIcCodingPercent: numOrNull(e.target.value) })
            }
            placeholder="50"
            min="0"
            max="100"
          />
        </Group>
      </div>

      <Group label="Excluded domains" hint="Keywords that disqualify a role.">
        <TagInput
          value={hard.domainExclusions || []}
          onChange={v => setHard({ domainExclusions: v })}
          placeholder="martech, crypto, notifications…"
        />
      </Group>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={!!hard.remoteRequired}
          onChange={e => setHard({ remoteRequired: e.target.checked })}
        />
        <span>Remote required</span>
      </label>

      <Group
        label="Relocation / in-person exceptions"
        hint="Cities where on-site is acceptable anyway."
      >
        <TagInput
          value={hard.relocationExceptions || []}
          onChange={v => setHard({ relocationExceptions: v })}
          placeholder="Seattle, New York…"
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
          placeholder="e.g. Seattle ok only for exceptional opportunities."
        />
      </Group>

      <h3 className={styles.subhead}>Soft preferences</h3>
      <p className={styles.subhint}>
        Judgment calls the AI weighs when scoring — not pattern-matched by code.
      </p>

      <Group label="Product vs. infra orientation">
        <textarea
          className={styles.area}
          rows={2}
          value={soft.productVsInfra || ''}
          onChange={e => setSoft({ productVsInfra: e.target.value })}
          placeholder="product-focused, full-stack — leaning away from infra-only mandates"
        />
      </Group>

      <Group label="Preferred company type">
        <input
          type="text"
          value={soft.companyType || ''}
          onChange={e => setSoft({ companyType: e.target.value })}
          placeholder="AI-first or mission-driven"
        />
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
        <textarea
          className={styles.area}
          rows={3}
          value={(p.differentiators || []).join('\n')}
          onChange={e =>
            setProfile({ differentiators: splitLines(e.target.value) })
          }
          placeholder={'Scaled a team from 5 to 30\nShipped X to N million users'}
        />
      </Group>

      <Group
        label="Red-flag patterns"
        hint="Patterns to watch for in JD language — one per line. Not keyword matches."
      >
        <textarea
          className={styles.area}
          rows={3}
          value={(p.redFlagPatterns || []).join('\n')}
          onChange={e =>
            setProfile({ redFlagPatterns: splitLines(e.target.value) })
          }
          placeholder={'Hidden IC coding expectations in EM/Director titles'}
        />
      </Group>
    </>
  );

  if (embedded) return body;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Search Criteria</h2>
      <p className={styles.lead}>
        Your criteria personalize fit scoring. Hard filters are checked in your
        browser (no AI call); soft preferences guide the AI's judgment. Only
        sent — transiently, never stored — when you score a role. Everything
        round-trips through Export / Import.
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

function Group({ label, hint, children }) {
  return (
    <div className={styles.group}>
      <label className={styles.label}>{label}</label>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}
