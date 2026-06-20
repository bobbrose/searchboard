import styles from './EmptyState.module.css';

// Friendly placeholder for an empty collection. `action` is an optional node
// (usually a button) rendered below the message.
export default function EmptyState({ icon = '∅', title, hint, action }) {
  return (
    <div className={styles.empty}>
      <div className={styles.icon} aria-hidden="true">
        {icon}
      </div>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
