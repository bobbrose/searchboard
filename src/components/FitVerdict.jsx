import Badge from './Badge.jsx';
import { FIT_LEVELS, ACTION_LEVELS, DIM_STATUS } from '../lib/fit.js';
import styles from './FitVerdict.module.css';

// Two-axis verdict: Fit (how closely the role matches the criteria) and Action
// (what to do — driven by fit, but able to override it). Shared by the inline
// view in ApplicationForm, the Applications list, and the Analysis timeline.

// `keys` falls back to the old `peopleLeadership` name so verdicts scored before
// the rename still render. `dim` ties a stage to its rubric status (role/domain/
// comp/stack); 'Red flags' is a check, not a scored dimension, so it has none.
const STAGES = [
  { keys: ['roleFit', 'peopleLeadership'], label: 'Role & level', dim: 'role' },
  { keys: ['domainFit'], label: 'Domain fit', dim: 'domain' },
  { keys: ['comp'], label: 'Comp', dim: 'comp' },
  { keys: ['stackAlignment'], label: 'Stack alignment', dim: 'stack' },
  { keys: ['redFlags'], label: 'Red flags', dim: null }
];

// Just the two badges — reusable wherever a compact verdict chip is wanted.
export function FitBadges({ fit }) {
  if (!fit) return null;
  const f = FIT_LEVELS[fit.fit];
  const a = ACTION_LEVELS[fit.action];
  return (
    <span className={styles.badges}>
      {f && <Badge tone={f.tone}>{f.label}</Badge>}
      {a && <Badge tone={a.tone}>→ {a.label}</Badge>}
    </span>
  );
}

export default function FitVerdict({ fit, compact = false }) {
  if (!fit) return null;
  const reasoning = fit.reasoning || {};
  const dims = fit.dimensions || {};

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <FitBadges fit={fit} />
        {fit._hardFilter && <span className={styles.note}>instant — no AI call</span>}
      </div>

      <dl className={styles.stages}>
        {STAGES.map(({ keys, label, dim }) => {
          const text = keys.map(k => reasoning[k]).find(Boolean);
          const status = dim ? dims[dim] : null;
          const s = status && DIM_STATUS[status];
          // Show a stage if it has reasoning text OR a rubric status to report.
          if (!text && !s) return null;
          return (
            <div key={label} className={styles.stage}>
              <dt className={styles.stageLabel}>
                <span>{label}</span>
                {s && <Badge tone={s.tone}>{s.label}</Badge>}
              </dt>
              {text && <dd className={styles.stageText}>{text}</dd>}
            </div>
          );
        })}
      </dl>

      {!compact && fit.coverLetterHook && (
        <div className={styles.hook}>
          <span className={styles.hookLabel}>Cover-letter hook</span>
          <p className={styles.hookText}>{fit.coverLetterHook}</p>
        </div>
      )}
    </div>
  );
}
