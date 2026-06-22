import styles from './InfoDot.module.css';

// A small "i" affordance that reveals explanatory content on hover or keyboard
// focus. Place it right after a label. The tooltip is right-anchored and opens
// downward so it stays on screen inside scrollable containers (e.g. a modal).
export default function InfoDot({ label = 'More information', children }) {
  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.dot}
        aria-label={label}
        // It often lives inside a <label>; don't let a click toggle the control.
        onClick={e => e.preventDefault()}
      >
        i
      </button>
      <span role="tooltip" className={styles.tip}>
        {children}
      </span>
    </span>
  );
}
