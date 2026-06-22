// src/lib/dates.js
//
// Small date helpers shared across the dashboard. Action-item urgency and
// contact staleness both reduce to "how many days away is this date", so the
// logic lives in one place.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Midnight-local for a date-only string ('YYYY-MM-DD') or any Date-parseable
// value. Comparing at day granularity avoids "overdue by 3 hours" surprises.
function startOfDay(value) {
  const d = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

// Whole days from today until `value`. Negative = in the past, 0 = today.
export function daysUntil(value) {
  const target = startOfDay(value);
  if (!target) return null;
  const today = startOfDay(new Date());
  return Math.round((target - today) / MS_PER_DAY);
}

// Whole days since `value`. 0 = today, positive = in the past.
export function daysSince(value) {
  const n = daysUntil(value);
  return n === null ? null : -n;
}

// A due date is overdue if it falls strictly before today.
export function isOverdue(value) {
  const n = daysUntil(value);
  return n !== null && n < 0;
}

// Human-friendly relative label for a due date.
export function dueLabel(value) {
  const n = daysUntil(value);
  if (n === null) return 'No due date';
  if (n < 0) return n === -1 ? '1 day overdue' : `${-n} days overdue`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}

// Today as a date-only 'YYYY-MM-DD' string in local time — matches what a
// native <input type="date"> produces, so the two compare cleanly.
export function today() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// 'Jun 19, 2026' style. Empty string in, empty string out.
export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Contact staleness, expressed as a tone + label for a Badge. Thresholds are
// deliberately gentle for a relationship-building (not high-volume) search.
export function staleness(lastContacted) {
  if (!lastContacted) return { tone: 'neutral', label: 'Never contacted' };
  const days = daysSince(lastContacted);
  if (days === null) return { tone: 'neutral', label: 'Unknown' };
  if (days <= 14) return { tone: 'fresh', label: label(days) };
  if (days <= 30) return { tone: 'warm', label: label(days) };
  return { tone: 'stale', label: label(days) };
}

function label(days) {
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

// Sort comparator for action items: overdue first (most overdue leading),
// then soonest-due, then undated last. Done items always sink to the bottom.
export function byUrgency(a, b) {
  if (!!a.done !== !!b.done) return a.done ? 1 : -1;
  const da = a.dueDate ? daysUntil(a.dueDate) : Infinity;
  const dbb = b.dueDate ? daysUntil(b.dueDate) : Infinity;
  return da - dbb;
}
