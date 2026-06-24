import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeWebsite, resolves } from './_url.js';

describe('normalizeWebsite', () => {
  it('returns empty for empty/garbage input', () => {
    expect(normalizeWebsite('')).toBe('');
    expect(normalizeWebsite(null)).toBe('');
    expect(normalizeWebsite('not a url with spaces')).toBe('');
  });

  it('adds a scheme and reduces to the origin', () => {
    expect(normalizeWebsite('acme.com')).toBe('https://acme.com');
    expect(normalizeWebsite('https://acme.com/careers?x=1')).toBe('https://acme.com');
    expect(normalizeWebsite('http://acme.com:8080/x')).toBe('http://acme.com:8080');
  });

  it('rejects a non-http(s) / malformed candidate', () => {
    // gets https:// prepended, then fails to parse as a valid URL
    expect(normalizeWebsite('javascript:alert(1)')).toBe('');
  });
});

describe('resolves', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is true when the fetch completes (any HTTP response)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 403 }));
    expect(await resolves('https://acme.com')).toBe(true);
  });

  it('is false when the fetch throws (DNS/connection failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
    expect(await resolves('https://nope.invalid')).toBe(false);
  });
});
