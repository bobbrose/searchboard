import { describe, it, expect } from 'vitest';
import {
  parseSalaryCeiling,
  hasCriteria,
  checkHardFilters,
  summarizeFit,
  appendCalibration,
  CALIBRATION_MAX
} from './fit.js';

describe('parseSalaryCeiling', () => {
  it('takes the top of a range', () => {
    expect(parseSalaryCeiling('$200K – $250K')).toBe(250000);
    expect(parseSalaryCeiling('$243,000-$256,500')).toBe(256500);
    expect(parseSalaryCeiling('$120k-150k')).toBe(150000);
  });

  it('carries a single suffix across an abbreviated range', () => {
    expect(parseSalaryCeiling('$180–210k')).toBe(210000);
  });

  it('handles commas and the m suffix', () => {
    expect(parseSalaryCeiling('$265,000-279,500')).toBe(279500);
    expect(parseSalaryCeiling('$1.2M')).toBe(1200000);
  });

  it('ignores stray small numbers that are not salaries', () => {
    expect(parseSalaryCeiling('5 weeks PTO')).toBeNull();
  });

  it('returns null for empty / unparseable / non-string input', () => {
    expect(parseSalaryCeiling('')).toBeNull();
    expect(parseSalaryCeiling('Competitive')).toBeNull();
    expect(parseSalaryCeiling(null)).toBeNull();
    expect(parseSalaryCeiling(250000)).toBeNull();
  });
});

describe('hasCriteria', () => {
  it('is false for empty / missing profiles', () => {
    expect(hasCriteria(null)).toBe(false);
    expect(hasCriteria({})).toBe(false);
    expect(hasCriteria({ hardFilters: {}, softPreferences: {} })).toBe(false);
  });

  it('is true when any signal is present', () => {
    expect(hasCriteria({ targetTitles: ['Staff Eng'] })).toBe(true);
    expect(hasCriteria({ softPreferences: { notes: 'remote pls' } })).toBe(true);
    expect(hasCriteria({ hardFilters: { remoteRequired: true } })).toBe(true);
  });

  it('treats a comp floor of 0 as a real signal', () => {
    expect(hasCriteria({ hardFilters: { compFloor: 0 } })).toBe(true);
  });

  it('ignores a falsy remoteRequired flag', () => {
    expect(hasCriteria({ hardFilters: { remoteRequired: false } })).toBe(false);
  });
});

describe('checkHardFilters', () => {
  it('passes (rejects) when the top of comp is below the floor', () => {
    const v = checkHardFilters(
      { hardFilters: { compFloor: 200000 } },
      { salary: '$150k' }
    );
    expect(v).toMatchObject({ fit: 'miss', action: 'pass', _hardFilter: true });
    expect(v.reasoning.comp).toContain('below your floor');
  });

  it('proceeds (null) when comp clears the floor', () => {
    expect(
      checkHardFilters({ hardFilters: { compFloor: 200000 } }, { salary: '$250k' })
    ).toBeNull();
  });

  it('proceeds when comp is unstated/unparseable (no false reject)', () => {
    expect(
      checkHardFilters(
        { hardFilters: { compFloor: 200000 } },
        { salary: 'Competitive' }
      )
    ).toBeNull();
  });

  it('rejects an on-site/hybrid role when remote is required', () => {
    const v = checkHardFilters(
      { hardFilters: { remoteRequired: true } },
      { jdText: 'This is a hybrid role in our office.' }
    );
    expect(v).toMatchObject({ action: 'pass', _hardFilter: true });
  });

  it('honors a relocation exception city', () => {
    expect(
      checkHardFilters(
        { hardFilters: { remoteRequired: true, relocationExceptions: ['New York'] } },
        { location: 'New York', jdText: 'hybrid, 3 days in office' }
      )
    ).toBeNull();
  });

  it('proceeds for a fully remote role', () => {
    expect(
      checkHardFilters(
        { hardFilters: { remoteRequired: true } },
        { jdText: 'Fully remote, work from anywhere.' }
      )
    ).toBeNull();
  });

  it('proceeds when there are no hard filters', () => {
    expect(checkHardFilters({}, { salary: '$10k', jdText: 'onsite' })).toBeNull();
  });
});

describe('summarizeFit', () => {
  it('returns empty string for no verdict', () => {
    expect(summarizeFit(null)).toBe('');
  });

  it('renders the headline and present reasoning fields', () => {
    const out = summarizeFit({
      fit: 'close',
      action: 'apply',
      reasoning: { roleFit: 'Strong match', comp: 'Above floor' },
      coverLetterHook: 'Hello'
    });
    expect(out).toContain('Close fit → Apply');
    expect(out).toContain('Role & level: Strong match');
    expect(out).toContain('Comp: Above floor');
    expect(out).toContain('Cover-letter hook: Hello');
    // Absent fields are omitted.
    expect(out).not.toContain('Domain fit:');
  });
});

describe('appendCalibration', () => {
  const ex = n => ({ id: String(n), digest: `role ${n}`, correct: { fit: 'close', action: 'apply' } });

  it('prepends newest-first', () => {
    const out = appendCalibration([ex(1)], ex(2));
    expect(out.map(e => e.id)).toEqual(['2', '1']);
  });

  it('caps at CALIBRATION_MAX, dropping the oldest', () => {
    let list = [];
    for (let i = 1; i <= CALIBRATION_MAX + 3; i++) list = appendCalibration(list, ex(i));
    expect(list).toHaveLength(CALIBRATION_MAX);
    // newest kept, oldest dropped
    expect(list[0].id).toBe(String(CALIBRATION_MAX + 3));
    expect(list.some(e => e.id === '1')).toBe(false);
  });

  it('treats a missing list as empty', () => {
    expect(appendCalibration(undefined, ex(1))).toEqual([ex(1)]);
  });

  it('does not mutate the input list', () => {
    const orig = [ex(1)];
    appendCalibration(orig, ex(2));
    expect(orig).toEqual([ex(1)]);
  });
});
