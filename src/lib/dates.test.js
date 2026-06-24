import { describe, it, expect } from 'vitest';
import {
  today,
  daysFromToday,
  daysUntil,
  daysSince,
  isOverdue,
  dueLabel,
  formatDate,
  byUrgency
} from './dates.js';

describe('daysUntil / daysSince', () => {
  it('is 0 for today and signed for past/future', () => {
    expect(daysUntil(today())).toBe(0);
    expect(daysUntil(daysFromToday(3))).toBe(3);
    expect(daysUntil(daysFromToday(-2))).toBe(-2);
    expect(daysSince(daysFromToday(-2))).toBe(2);
  });

  it('returns null for an invalid date', () => {
    expect(daysUntil('not a date')).toBeNull();
    expect(daysSince(undefined)).toBeNull();
  });
});

describe('isOverdue', () => {
  it('is true only strictly before today', () => {
    expect(isOverdue(daysFromToday(-1))).toBe(true);
    expect(isOverdue(today())).toBe(false);
    expect(isOverdue(daysFromToday(1))).toBe(false);
    expect(isOverdue('garbage')).toBe(false);
  });
});

describe('dueLabel', () => {
  it('renders relative labels', () => {
    expect(dueLabel(undefined)).toBe('No due date');
    expect(dueLabel(today())).toBe('Due today');
    expect(dueLabel(daysFromToday(1))).toBe('Due tomorrow');
    expect(dueLabel(daysFromToday(4))).toBe('Due in 4 days');
    expect(dueLabel(daysFromToday(-1))).toBe('1 day overdue');
    expect(dueLabel(daysFromToday(-3))).toBe('3 days overdue');
  });
});

describe('formatDate', () => {
  it('returns empty string for empty/invalid input', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate('not a date')).toBe('');
  });

  it('formats a valid date with year, month and day', () => {
    const out = formatDate('2026-06-19');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/19/);
  });
});

describe('byUrgency', () => {
  it('sorts overdue first, then soonest, undated last, done at the bottom', () => {
    const items = [
      { id: 'undated' },
      { id: 'done', done: true, dueDate: daysFromToday(-5) },
      { id: 'overdue', dueDate: daysFromToday(-2) },
      { id: 'soon', dueDate: daysFromToday(1) }
    ];
    const order = [...items].sort(byUrgency).map(i => i.id);
    expect(order).toEqual(['overdue', 'soon', 'undated', 'done']);
  });
});
