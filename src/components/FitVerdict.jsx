import Badge from './Badge.jsx';
import styles from './FitVerdict.module.css';

// Renders a fit-scoring verdict: a verdict + priority badge row, the five
// reasoning stages, and the cover-letter hook. Shared by the inline view in
// ApplicationForm and the persisted entry in Analysis.

const VERDICT_TONE = { apply: 'ok', conditional: 'warm', pass: 'stale' };
const VERDICT_LABEL = { apply: 'Apply', conditional: 'Conditional', pass: 'Pass' };
const PRIORITY_TONE = {
  high: 'overdue',
  'medium-high': 'warm',
  medium: 'accent',
  low: 'neutral'
};

const STAGES = [
  ['peopleLeadership', 'People leadership'],
  ['domainFit', 'Domain fit'],
  ['comp', 'Comp'],
  ['stackAlignment', 'Stack alignment'],
  ['redFlags', 'Red flags']
];

export default function FitVerdict({ fit, compact = false }) {
  if (!fit) return null;
  const reasoning = fit.reasoning || {};

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <Badge tone={VERDICT_TONE[fit.verdict] || 'neutral'}>
          {VERDICT_LABEL[fit.verdict] || fit.verdict}
        </Badge>
        {fit.priority && (
          <Badge tone={PRIORITY_TONE[fit.priority] || 'neutral'}>
            {fit.priority} priority
          </Badge>
        )}
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
