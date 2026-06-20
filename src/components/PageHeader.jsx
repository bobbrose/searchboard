import styles from './PageHeader.module.css';

// Standard page top: title + optional subtitle on the left, actions on the
// right (buttons, view toggles, etc.).
export default function PageHeader({ title, subtitle, children }) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </header>
  );
}
