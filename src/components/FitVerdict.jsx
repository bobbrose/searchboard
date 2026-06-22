import Badge from './Badge.jsx';
import { FIT_LEVELS, ACTION_LEVELS } from '../lib/fit.js';
import styles from './FitVerdict.module.css';

// Two-axis verdict: Fit (how closely the role matches the criteria) and Action
// (what to do — driven by fit, but able to override it). Shared by the inline
// view in ApplicationForm, the Applications list, and the Analysis timeline.

const STAGES = [
  ['peopleLeadership', 'People leadership'],
  ['domainFit', 'Domain fit'],
  ['comp', 'Comp'],
  ['stackAlignment', 'Stack alignment'],
  ['redFlags', 'Red flags']
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

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <FitBadges fit={fit} />
        {fit._hardFilter && <span className={styles.note}>instant — no AI call</span>}
      </div>

      <dl className={styles.stages}>
        {STAGES.map(([key, label]) =>
          reasoning[key] ? (
            <div key={key} className={styles.stage}>
              <dt className={styles.stageLabel}>{label}</dt>
              <dd className={styles.stageText}>{reasoning[key]}</dd>
            </div>
          ) : null
        )}
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
