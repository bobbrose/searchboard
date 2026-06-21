// src/lib/fit.js
//
// Client-side fit helpers: detect whether a profile is worth scoring, and run
// the deterministic hard-filter pre-check that can reject a role *before* any
// Anthropic call (VISION principle #6 — don't spend the shared key on a yes/no
// a boolean can settle). Soft judgment lives server-side in /api/score-fit.

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
      hard.maxIcCodingPercent != null ||
      hard.domainExclusions?.length ||
      hard.remoteRequired ||
      soft.productVsInfra ||
      soft.companyType ||
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

// Returns an instant-pass verdict { verdict:'pass', priority, reasoning,
// coverLetterHook } if a deterministic hard filter trips, else null (meaning:
// proceed to AI scoring). Only unambiguous boolean blocks live here — comp
// floor and a remote-required conflict. Domain keywords are intentionally left
// to the model (a weak heuristic; a false positive would waste a call).
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
  const lines = [`Verdict: ${fit.verdict}${fit.priority ? ` (${fit.priority} priority)` : ''}`];
  const add = (label, v) => v && lines.push(`${label}: ${v}`);
  add('People leadership', r.peopleLeadership);
  add('Domain fit', r.domainFit);
  add('Comp', r.comp);
  add('Stack alignment', r.stackAlignment);
  add('Red flags', r.redFlags);
  add('Cover-letter hook', fit.coverLetterHook);
  return lines.join('\n');
}

function pass(comp) {
  return {
    verdict: 'pass',
    priority: 'low',
    reasoning: {
      peopleLeadership: '',
      domainFit: '',
      comp,
      stackAlignment: '',
      redFlags: ''
    },
    coverLetterHook: '',
    _hardFilter: true // marks an instant, no-AI verdict
  };
}
