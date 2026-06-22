// src/lib/fit.js
//
// Client-side fit helpers: detect whether a profile is worth scoring, and run
// the deterministic hard-filter pre-check that can reject a role *before* any
// Anthropic call (VISION principle #6 — don't spend the shared key on a yes/no
// a boolean can settle). Soft judgment lives server-side in /api/score-fit.

// Hands-on IC-coding preference — a coarse 3-state choice rather than a false-
// precision percentage (nobody knows the "real" number from a JD anyway).
export const IC_CODING_OPTIONS = [
  { value: '', label: 'No preference' },
  { value: 'none', label: 'None — pure leadership' },
  { value: 'hands-on', label: 'Some hands-on' },
  { value: 'mostly', label: 'Primarily / mostly coding' }
];

// Curated company-attribute chips, grouped by dimension. A single "company
// type" text box conflated several independent axes; grouping keeps each axis
// legible while users pick whichever apply across all of them. Selections are
// stored flat in softPreferences.companyAttributes. Soft signal; nuance lives
// in softPreferences.notes.
export const COMPANY_DIMENSIONS = [
  { label: 'Stage / maturity', options: ['Early-stage', 'Growth-stage', 'Large / public'] },
  {
    label: 'Mission',
    options: ['Mission-driven', 'Philanthropic / non-profit', 'Purely commercial']
  },
  { label: 'Tech posture', options: ['AI-first', 'AI-adopting', 'Not AI-centric'] },
  {
    label: 'Domain / model',
    options: ['Devtools / infra', 'B2B SaaS', 'Consumer', 'Research-oriented']
  },
  { label: 'Culture', options: ['Remote-first', 'Sustainable pace', 'Hypergrowth'] }
];

// Product↔infra orientation — a spectrum, not a binary, so a 3-way single-
// select with a middle "balanced" rather than an either/or toggle.
export const PRODUCT_INFRA_OPTIONS = [
  { value: 'product', label: 'Product-focused' },
  { value: 'balanced', label: 'Balanced / full-stack' },
  { value: 'infra', label: 'Infra-focused' }
];

// Two orthogonal axes of a verdict, with display label + Badge tone:
//   fit    — how closely the role matches the candidate's criteria (descriptive)
//   action — what to do, driven by fit but able to override it (prescriptive)
export const FIT_LEVELS = {
  close: { label: 'Close fit', tone: 'ok' },
  partial: { label: 'Partial fit', tone: 'warm' },
  miss: { label: 'Miss', tone: 'stale' }
};
export const ACTION_LEVELS = {
  apply: { label: 'Apply', tone: 'accent' },
  wait: { label: 'Wait', tone: 'warm' },
  pass: { label: 'Pass', tone: 'stale' }
};

// True if the profile carries enough signal to score against.
export function hasCriteria(profile) {
  const p = profile || {};
  const hard = p.hardFilters || {};
  const soft = p.softPreferences || {};
  return Boolean(
    p.targetTitles?.length ||
      p.differentiators?.length ||
      p.redFlagPatterns?.length ||
      hard.compFloor != null ||
      hard.icCoding ||
      hard.domainExclusions?.length ||
      hard.remoteRequired ||
      soft.productVsInfra ||
      soft.companyAttributes?.length ||
      soft.notes
  );
}

// Best-effort lowest dollar figure from a salary string. Handles k/m suffixes,
// commas, and ranges ("$200K – $250K" -> 200000, "$243,000-$256,500" -> 243000).
// Returns null if nothing parseable. Only ever fed the extracted `salary`
// field, which is already comp-focused, so false positives are unlikely.
export function parseSalaryFloor(salary) {
  if (!salary || typeof salary !== 'string') return null;
  const raw = [...salary.matchAll(/\$?\s*([\d][\d,.]*)\s*([kKmM])?/g)]
    .map(m => ({ n: Number(m[1].replace(/,/g, '')), suffix: (m[2] || '').toLowerCase() }))
    .filter(x => Number.isFinite(x.n));

  // In a range like "$180–210k" the suffix is written once but applies to both
  // numbers; carry it to bare numbers that look abbreviated (< 1000).
  const groupSuffix = raw.find(x => x.suffix)?.suffix || '';

  const nums = [];
  for (const { n, suffix } of raw) {
    const s = suffix || (n < 1000 ? groupSuffix : '');
    let v = n;
    if (s === 'k') v *= 1000;
    else if (s === 'm') v *= 1_000_000;
    // Ignore stray small numbers that clearly aren't salaries (e.g. "401").
    if (v >= 1000) nums.push(v);
  }
  return nums.length ? Math.min(...nums) : null;
}

const ONSITE_RE = /\b(on-?site|on site|in-office|in office|hybrid)\b/i;

// Returns an instant verdict ({ fit:'miss', action:'pass', … }) if a
// deterministic hard filter trips, else null (meaning: proceed to AI scoring).
// Only unambiguous boolean blocks live here — comp floor and a remote-required
// conflict. Domain keywords are intentionally left to the model (a weak
// heuristic; a false positive would waste a call).
export function checkHardFilters(profile, { salary, jdText = '', location = '' }) {
  const hard = profile?.hardFilters || {};

  if (hard.compFloor != null) {
    const floor = parseSalaryFloor(salary);
    if (floor != null && floor < hard.compFloor) {
      return pass(
        `Stated comp (~$${floor.toLocaleString()}) is below your floor of $${hard.compFloor.toLocaleString()}.`
      );
    }
  }

  if (hard.remoteRequired) {
    const haystack = `${location}\n${jdText}`;
    const exceptions = hard.relocationExceptions || [];
    const inException = exceptions.some(
      city => city && haystack.toLowerCase().includes(city.toLowerCase())
    );
    if (ONSITE_RE.test(haystack) && !inException) {
      return pass(
        'Role appears to require on-site/hybrid presence, which conflicts with your remote-required filter.'
      );
    }
  }

  return null;
}

// Flatten a verdict into a plain-text body, so a 'Fit scoring' Analysis entry
// is still readable anywhere that only renders `entry.body` (and in exports).
export function summarizeFit(fit) {
  if (!fit) return '';
  const r = fit.reasoning || {};
  const fitLabel = FIT_LEVELS[fit.fit]?.label || fit.fit;
  const actionLabel = ACTION_LEVELS[fit.action]?.label || fit.action;
  const lines = [`${fitLabel} → ${actionLabel}`];
  const add = (label, v) => v && lines.push(`${label}: ${v}`);
  add('Role & level', r.roleFit || r.peopleLeadership);
  add('Domain fit', r.domainFit);
  add('Comp', r.comp);
  add('Stack alignment', r.stackAlignment);
  add('Red flags', r.redFlags);
  add('Cover-letter hook', fit.coverLetterHook);
  return lines.join('\n');
}

function pass(comp) {
  return {
    fit: 'miss',
    action: 'pass',
    reasoning: {
      roleFit: '',
      domainFit: '',
      comp,
      stackAlignment: '',
      redFlags: ''
    },
    coverLetterHook: '',
    _hardFilter: true // marks an instant, no-AI verdict
  };
}
