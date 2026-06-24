import { describe, it, expect } from 'vitest';
import { resolveAtsUrl, atsPayloadToText, htmlToText } from './_ats.js';

describe('resolveAtsUrl — allowlist matches', () => {
  it('resolves Greenhouse board URLs to the API host', () => {
    expect(resolveAtsUrl('https://boards.greenhouse.io/acme/jobs/12345')).toEqual({
      provider: 'greenhouse',
      apiUrl: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345'
    });
    expect(
      resolveAtsUrl('https://job-boards.greenhouse.io/acme/jobs/12345').provider
    ).toBe('greenhouse');
  });

  it('resolves a custom domain via gh_jid, deriving the board from the host', () => {
    expect(resolveAtsUrl('https://instacart.careers/job?gh_jid=7947506')).toEqual({
      provider: 'greenhouse',
      apiUrl: 'https://boards-api.greenhouse.io/v1/boards/instacart/jobs/7947506'
    });
  });

  it('resolves Lever and Ashby URLs', () => {
    expect(resolveAtsUrl('https://jobs.lever.co/acme/abc-123')).toEqual({
      provider: 'lever',
      apiUrl: 'https://api.lever.co/v0/postings/acme/abc-123?mode=json'
    });
    expect(resolveAtsUrl('https://jobs.ashbyhq.com/acme/uuid-1/application')).toEqual({
      provider: 'ashby',
      jobId: 'uuid-1',
      apiUrl:
        'https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true'
    });
  });
});

describe('resolveAtsUrl — SSRF safety (everything off-allowlist is null)', () => {
  it('rejects unknown hosts', () => {
    expect(resolveAtsUrl('https://example.com/jobs/1')).toBeNull();
    expect(resolveAtsUrl('http://localhost/admin')).toBeNull();
    expect(resolveAtsUrl('https://169.254.169.254/latest/meta-data')).toBeNull();
  });

  it('rejects a lookalike host that only embeds an ATS in the path', () => {
    expect(
      resolveAtsUrl('https://evil.com/boards.greenhouse.io/acme/jobs/1')
    ).toBeNull();
  });

  it('rejects unparseable input and incomplete paths', () => {
    expect(resolveAtsUrl('not a url')).toBeNull();
    expect(resolveAtsUrl('https://boards.greenhouse.io/acme/jobs/')).toBeNull();
  });

  it('rejects tokens with unsafe characters (no path/host injection)', () => {
    // space -> %20 in the path, which fails the [A-Za-z0-9_-] guard
    expect(resolveAtsUrl('https://boards.greenhouse.io/ac me/jobs/1')).toBeNull();
  });
});

describe('htmlToText', () => {
  it('decodes entities then strips tags', () => {
    expect(htmlToText('&lt;b&gt;Hi&lt;/b&gt;')).toBe('Hi');
    expect(htmlToText('&amp;&#39;&#x41;')).toBe("&'A");
  });

  it('turns block boundaries into newlines and collapses whitespace', () => {
    expect(htmlToText('<p>Line1</p><p>Line2</p>')).toBe('Line1\nLine2');
    expect(htmlToText('a<br>b')).toBe('a\nb');
  });

  it('returns empty string for empty input', () => {
    expect(htmlToText('')).toBe('');
  });
});

describe('atsPayloadToText', () => {
  it('normalizes a Greenhouse payload to title/location/body', () => {
    const out = atsPayloadToText('greenhouse', {
      title: 'Eng',
      location: { name: 'Remote' },
      content: '&lt;p&gt;Build things&lt;/p&gt;'
    });
    expect(out).toBe('Title: Eng\nLocation: Remote\n\nBuild things');
  });

  it('uses Lever plain description when present', () => {
    const out = atsPayloadToText('lever', {
      text: 'Eng',
      categories: { location: 'NYC' },
      descriptionPlain: 'Body text'
    });
    expect(out).toBe('Title: Eng\nLocation: NYC\n\nBody text');
  });

  it('picks the Ashby job by id and appends structured comp', () => {
    const out = atsPayloadToText(
      'ashby',
      {
        jobs: [
          {
            id: 'j1',
            title: 'Eng',
            location: 'Remote',
            descriptionPlain: 'Body',
            compensation: { compensationTierSummary: '$200k' }
          }
        ]
      },
      'j1'
    );
    expect(out).toBe('Title: Eng\nLocation: Remote\n\nBody\n\nCompensation: $200k');
  });

  it('returns empty string for a missing Ashby job or unknown provider', () => {
    expect(atsPayloadToText('ashby', { jobs: [] }, 'nope')).toBe('');
    expect(atsPayloadToText('workday', {}, '')).toBe('');
  });
});
