// src/lib/store.js
//
// Single source of truth for the app's data shape and persistence.
// Data lives in localStorage for the active session, and can be exported/
// imported as a single JSON file the user controls. No server-side storage
// of tracking data, ever — see VISION.md principle #1.

export const STAGES = ['Researching', 'Applied', 'Interviewing', 'Offer', 'Closed'];

export const ANALYSIS_TYPES = [
  'Pre-application research',
  'Fit scoring',
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

// How a contact is connected to a *specific* job — distinct from the contact's
// general RELATIONSHIP_TYPE. This is what records "who opened which door":
// a referrer is the highest-value link in a relationship-driven search.
export const CONTACT_RELATIONS = [
  { value: 'referrer', label: 'Referred me' },
  { value: 'contact', label: 'Contact here' },
  { value: 'recruiter', label: 'Recruiter for it' }
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
  // Date + HHmm (UTC) so multiple exports in a day don't collide. Colons are
  // stripped because some filesystems reject them. e.g. searchboard-export-2026-06-21-1904.json
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  a.download = `searchboard-export-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Collections that hold id-stamped records (array-valued in emptyDB).
const MERGE_COLLECTIONS = ['apps', 'orgs', 'contacts', 'analyses', 'todos'];

// "Newest wins" tiebreak between two versions of the same record. ISO 8601
// timestamps sort lexically, so a string compare is enough. A record missing
// updatedAt is treated as oldest; on a tie the existing record is kept.
function newer(existing, incoming) {
  return (incoming.updatedAt || '') > (existing.updatedAt || '') ? incoming : existing;
}

// Union `incoming` into `current` by record id, per collection. Records whose
// id appears in only one file are kept; same-id collisions resolve newest-wins.
// Cross-references survive because ids are preserved. The single-object
// `profile` (if present) is likewise resolved newest-wins.
export function mergeDB(current, incoming) {
  const merged = { ...emptyDB(), ...current };

  for (const key of MERGE_COLLECTIONS) {
    const byId = new Map((current[key] || []).map(r => [r.id, r]));
    for (const rec of incoming[key] || []) {
      if (!rec || !rec.id) continue; // skip malformed rows rather than dropping the import
      const existing = byId.get(rec.id);
      byId.set(rec.id, existing ? newer(existing, rec) : rec);
    }
    merged[key] = [...byId.values()];
  }

  if (current.profile || incoming.profile) {
    merged.profile = !current.profile
      ? incoming.profile
      : !incoming.profile
        ? current.profile
        : newer(current.profile, incoming.profile);
  }

  return merged;
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

// --- Client-side daily caps for the shared Anthropic endpoints -------------
// Soft per-browser caps so a single browser doesn't hammer the shared key. The
// server-side limiter in api/_ratelimit.js is the real backstop. One generic
// counter, one bucket (localStorage key) per endpoint.
const DAILY_LIMITS = {
  parse: { key: 'searchboard_parse_count_v1', limit: 50 },
  score: { key: 'searchboard_score_count_v1', limit: 25 },
  resume: { key: 'searchboard_resume_count_v1', limit: 50 }
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readCount(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return 0;
    const rec = JSON.parse(raw);
    return rec.date === today() ? rec.count : 0;
  } catch {
    return 0;
  }
}

// Generic: how many of `bucket` ('parse' | 'score') have been used today.
export function usedToday(bucket) {
  return readCount(DAILY_LIMITS[bucket].key);
}

// Generic: is there room left in `bucket` today?
export function canUseToday(bucket) {
  return usedToday(bucket) < DAILY_LIMITS[bucket].limit;
}

// Generic: record one use of `bucket`.
export function recordUse(bucket) {
  const { key } = DAILY_LIMITS[bucket];
  localStorage.setItem(
    key,
    JSON.stringify({ date: today(), count: readCount(key) + 1 })
  );
}

export const dailyLimit = bucket => DAILY_LIMITS[bucket].limit;

// Back-compat thin wrappers for the existing paste-a-JD callers.
export const canUseParseToday = () => canUseToday('parse');
export const recordParseUse = () => recordUse('parse');

// --- Per-browser token-usage tally -----------------------------------------
// A cumulative estimate of tokens this browser has sent through the shared key,
// per endpoint, for at-a-glance cost awareness. Per-browser only — the true
// spend across all users lives in the Anthropic Console. The server returns
// `_usage` ({ input_tokens, output_tokens }) on each successful call.
const TOKEN_USAGE_KEY = 'searchboard_token_usage_v1';

// claude-sonnet-4-6 list pricing, USD per token (input $3 / output $15 per 1M).
export const TOKEN_PRICING = { input: 3 / 1e6, output: 15 / 1e6 };

export function recordTokenUse(bucket, usage) {
  if (!usage) return;
  let rec;
  try {
    rec = JSON.parse(localStorage.getItem(TOKEN_USAGE_KEY)) || {};
  } catch {
    rec = {};
  }
  const b = rec[bucket] || { calls: 0, input: 0, output: 0 };
  b.calls += 1;
  b.input += usage.input_tokens || 0;
  b.output += usage.output_tokens || 0;
  rec[bucket] = b;
  try {
    localStorage.setItem(TOKEN_USAGE_KEY, JSON.stringify(rec));
  } catch (e) {
    console.error('Failed to record token usage', e);
  }
}

// Cumulative usage per bucket: { parse: { calls, input, output }, ... }.
export function tokenUsage() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_USAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function clearTokenUsage() {
  localStorage.removeItem(TOKEN_USAGE_KEY);
}
