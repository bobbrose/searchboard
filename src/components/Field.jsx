import styles from './Field.module.css';

// Labeled form controls. Each wraps a label + control + optional hint so forms
// stay consistent without repeating markup. All forward value/onChange etc.

export function Field({ label, hint, children, htmlFor }) {
  return (
    <label className={styles.field} htmlFor={htmlFor}>
      {label && <span className={styles.label}>{label}</span>}
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

export function TextField({ label, hint, type = 'text', ...props }) {
  return (
    <Field label={label} hint={hint}>
      <input type={type} {...props} />
    </Field>
  );
}

export function TextArea({ label, hint, rows = 4, ...props }) {
  return (
    <Field label={label} hint={hint}>
      <textarea rows={rows} {...props} />
    </Field>
  );
}

// options: array of strings, or { value, label } objects.
export function SelectField({ label, hint, options = [], placeholder, ...props }) {
  return (
    <Field label={label} hint={hint}>
      <select {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map(opt => {
          const value = typeof opt === 'string' ? opt : opt.value;
          const text = typeof opt === 'string' ? opt : opt.label;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

// Layout helper to place fields side by side.
export function FieldRow({ children }) {
  return <div className={styles.row}>{children}</div>;
}
