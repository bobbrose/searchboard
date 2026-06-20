import { useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import TodoForm from '../forms/TodoForm.jsx';
import { useDb, useSelectors } from '../lib/db.jsx';
import { byUrgency, dueLabel, isOverdue, formatDate } from '../lib/dates.js';
import styles from './ActionItems.module.css';

export default function ActionItems() {
  const { db } = useDb();
  const [editing, setEditing] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const open = db.todos.filter(t => !t.done).sort(byUrgency);
  const done = db.todos.filter(t => t.done).sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '')
  );
  const overdueCount = open.filter(t => isOverdue(t.dueDate)).length;

  return (
    <>
      <PageHeader
        title="Action Items"
        subtitle={
          db.todos.length
            ? `${open.length} open${overdueCount ? ` · ${overdueCount} overdue` : ''}`
            : undefined
        }
      >
        <button className="btn btn--primary" onClick={() => setEditing({})}>
          + Add action item
        </button>
      </PageHeader>

      {db.todos.length === 0 ? (
        <EmptyState
          icon="◎"
          title="No action items"
          hint="Track the time-sensitive things you owe someone — a dropped one can cost you the role or the relationship."
          action={
            <button className="btn btn--primary" onClick={() => setEditing({})}>
              + Add your first action item
            </button>
          }
        />
      ) : (
        <>
          <ul className={styles.list}>
            {open.map(todo => (
              <TodoRow key={todo.id} todo={todo} onEdit={() => setEditing(todo)} />
            ))}
            {open.length === 0 && (
              <li className={styles.allClear}>✓ All caught up — nothing open.</li>
            )}
          </ul>

          {done.length > 0 && (
            <div className={styles.doneSection}>
              <button
                className={styles.doneToggle}
                onClick={() => setShowDone(s => !s)}
              >
                {showDone ? '▾' : '▸'} Done ({done.length})
              </button>
              {showDone && (
                <ul className={styles.list}>
                  {done.map(todo => (
                    <TodoRow key={todo.id} todo={todo} onEdit={() => setEditing(todo)} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <TodoForm todo={editing.id ? editing : null} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function TodoRow({ todo, onEdit }) {
  const { update, remove } = useDb();
  const { linkedEntity } = useSelectors();
  const overdue = !todo.done && isOverdue(todo.dueDate);
  const link = linkedEntity(todo);

  const linkIcon = { app: '▤', org: '◳', contact: '☺' };

  return (
    <li className={`${styles.row} ${overdue ? styles.overdue : ''} ${todo.done ? styles.doneRow : ''}`}>
      <input
        type="checkbox"
        className={styles.check}
        checked={!!todo.done}
        onChange={e => update('todos', todo.id, { done: e.target.checked })}
        aria-label={todo.done ? 'Mark not done' : 'Mark done'}
      />
      <button className={styles.main} onClick={onEdit}>
        <span className={styles.title}>{todo.title || 'Untitled'}</span>
        <span className={styles.meta}>
          {todo.dueDate ? (
            <Badge tone={overdue ? 'overdue' : todo.done ? 'done' : 'neutral'} title={formatDate(todo.dueDate)}>
              {dueLabel(todo.dueDate)}
            </Badge>
          ) : (
            <span className={styles.noDate}>No due date</span>
          )}
          {link && (
            <span className={styles.link}>
              {linkIcon[link.type]} {link.label}
            </span>
          )}
        </span>
      </button>
      <button
        className="btn btn--ghost btn--sm btn--danger"
        onClick={() => remove('todos', todo.id)}
        title="Delete"
      >
        ✕
      </button>
    </li>
  );
}
