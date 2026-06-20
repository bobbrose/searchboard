// src/lib/store.js
//
// Single source of truth for the app's data shape and persistence.
// Data lives in localStorage for the active session, and can be exported/
// imported as a single JSON file the user controls. No server-side storage
// of tracking data, ever — see VISION.md principle #1.

export const STAGES = ['Researching', 'Applied', 'Interviewing', 'Offer', 'Closed'];

export const ANALYSIS_TYPES = [
  'Pre-application research',
  'Post-interview debrief',
  'Strategy note',
  'Conversation summary',
  'Other'
];

export const RELATIONSHIP_TYPES = [
  'Warm contact',
  'Cold outreach',
  'Recruiter',
  'Hiring manager',
  'Referral',
  'Met at event'
];

const STORAGE_KEY = 'searchboard_data_v1';

export function emptyDB() {
  return {
    version: 1,
    apps: [],
    orgs: [],
    contacts: [],
    analyses: [],
    todos: [],
    lastSaved: null
  };
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDB();
    const parsed = JSON.parse(raw);
    // shallow-merge so older saved files don't break on new fields
    return { ...emptyDB(), ...parsed };
  } catch {
    return emptyDB();
  }
}

export function saveToLocalStorage(db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
}

export function exportAsFile(db) {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `searchboard-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        resolve({ ...emptyDB(), ...parsed });
      } catch (e) {
        reject(new Error('Could not parse that file as Searchboard JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

// --- Share-a-role: serialize a single application into a URL-safe string ---
// No server storage involved — the record itself lives in the URL.
export function encodeShareableApp(app) {
  const json = JSON.stringify(app);
  return btoa(encodeURIComponent(json));
}

export function decodeShareableApp(encoded) {
  try {
    const json = decodeURIComponent(atob(encoded));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// --- Rate-limit token for the shared /api/parse endpoint -------------------
// Client-side soft cap so a single browser doesn't hammer the shared key.
// The server-side limiter in api/parse.js is the real backstop.
const PARSE_LIMIT_KEY = 'searchboard_parse_count_v1';
const DAILY_PARSE_LIMIT = 15;

export function canUseParseToday() {
  const today = new Date().toISOString().slice(0, 10);
  const raw = localStorage.getItem(PARSE_LIMIT_KEY);
  const record = raw ? JSON.parse(raw) : { date: today, count: 0 };
  if (record.date !== today) return true;
  return record.count < DAILY_PARSE_LIMIT;
}

export function recordParseUse() {
  const today = new Date().toISOString().slice(0, 10);
  const raw = localStorage.getItem(PARSE_LIMIT_KEY);
  const record = raw ? JSON.parse(raw) : { date: today, count: 0 };
  const updated = record.date === today
    ? { date: today, count: record.count + 1 }
    : { date: today, count: 1 };
  localStorage.setItem(PARSE_LIMIT_KEY, JSON.stringify(updated));
}
