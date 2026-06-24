import { describe, it, expect } from 'vitest';
import { emptyDB, mergeDB } from './store.js';

describe('emptyDB', () => {
  it('has all record collections empty', () => {
    const db = emptyDB();
    expect(db.apps).toEqual([]);
    expect(db.orgs).toEqual([]);
    expect(db.contacts).toEqual([]);
    expect(db.analyses).toEqual([]);
    expect(db.todos).toEqual([]);
    expect(db.version).toBe(1);
  });
});

describe('mergeDB', () => {
  it('unions records by id across a collection', () => {
    const current = { ...emptyDB(), apps: [{ id: 'a' }] };
    const incoming = { ...emptyDB(), apps: [{ id: 'b' }] };
    const merged = mergeDB(current, incoming);
    expect(merged.apps.map(a => a.id).sort()).toEqual(['a', 'b']);
  });

  it('resolves same-id collisions newest-wins by updatedAt', () => {
    const current = {
      ...emptyDB(),
      apps: [{ id: 'a', title: 'old', updatedAt: '2026-01-01T00:00:00Z' }]
    };
    const incoming = {
      ...emptyDB(),
      apps: [{ id: 'a', title: 'new', updatedAt: '2026-06-01T00:00:00Z' }]
    };
    expect(mergeDB(current, incoming).apps[0].title).toBe('new');
  });

  it('keeps the existing record when incoming is older', () => {
    const current = {
      ...emptyDB(),
      apps: [{ id: 'a', title: 'keep', updatedAt: '2026-06-01T00:00:00Z' }]
    };
    const incoming = {
      ...emptyDB(),
      apps: [{ id: 'a', title: 'stale', updatedAt: '2026-01-01T00:00:00Z' }]
    };
    expect(mergeDB(current, incoming).apps[0].title).toBe('keep');
  });

  it('skips malformed incoming rows without an id', () => {
    const current = { ...emptyDB(), apps: [{ id: 'a' }] };
    const incoming = { ...emptyDB(), apps: [{ title: 'no id' }, null, { id: 'b' }] };
    const merged = mergeDB(current, incoming);
    expect(merged.apps.map(a => a.id).sort()).toEqual(['a', 'b']);
  });

  it('does not mutate the inputs', () => {
    const current = { ...emptyDB(), apps: [{ id: 'a' }] };
    const incoming = { ...emptyDB(), apps: [{ id: 'b' }] };
    mergeDB(current, incoming);
    expect(current.apps).toHaveLength(1);
    expect(incoming.apps).toHaveLength(1);
  });

  it('resolves the singleton profile newest-wins', () => {
    const current = { ...emptyDB(), profile: { updatedAt: '2026-01-01', a: 1 } };
    const incoming = { ...emptyDB(), profile: { updatedAt: '2026-06-01', a: 2 } };
    expect(mergeDB(current, incoming).profile.a).toBe(2);
  });

  it('keeps whichever side has the only profile', () => {
    const withProfile = { ...emptyDB(), profile: { a: 1 } };
    expect(mergeDB(withProfile, emptyDB()).profile).toEqual({ a: 1 });
    expect(mergeDB(emptyDB(), withProfile).profile).toEqual({ a: 1 });
  });
});
