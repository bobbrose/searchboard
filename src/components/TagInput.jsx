import { useState } from 'react';
import styles from './TagInput.module.css';

// A simple tag editor over an array of strings. Enter or comma commits the
// current text as a tag; Backspace on an empty field removes the last tag.
// `value` is the array, `onChange(nextArray)` is called on every mutation.
export default function TagInput({ value = [], onChange, placeholder }) {
  const [text, setText] = useState('');

  function commit() {
    const t = text.trim().replace(/,$/, '').trim();
    if (!t) return;
    if (!value.includes(t)) onChange([...value, t]);
    setText('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className={styles.wrap}>
      {value.map(tag => (
        <span key={tag} className={styles.tag}>
          {tag}
          <button
            type="button"
            className={styles.remove}
            onClick={() => onChange(value.filter(t => t !== tag))}
            aria-label={`Remove ${tag}`}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        className={styles.input}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={value.length ? '' : placeholder}
      />
    </div>
  );
}
