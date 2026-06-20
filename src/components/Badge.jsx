import styles from './Badge.module.css';

// A small pill. `tone` picks the color vocabulary; defaults to neutral.
// Tones: neutral, accent, fresh, warm, stale, overdue, ok, done.
export default function Badge({ tone = 'neutral', children, title }) {
  return (
    <span className={`${styles.badge} ${styles[tone] || ''}`} title={title}>
      {children}
    </span>
  );
}
