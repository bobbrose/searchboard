// src/lib/website.js
//
// Find a company's official website via /api/find-website, plus small helpers
// for rendering a stored URL. Lookups are best-effort, respect the per-browser
// daily cap, and are de-duped per session so reopening a form doesn't re-hit
// the API for the same blank org.

import { canUseToday, recordUse, recordTokenUse } from './store.js';

// Company names already tried this session (found or not), to avoid repeat
// calls when a form is reopened or an org genuinely has no findable site.
const attempted = new Set();

export async function findWebsite({ name, industry = '', location = '' } = {}) {
  const key = (name || '').trim().toLowerCase();
  if (!key || attempted.has(key)) return '';
  attempted.add(key);
  if (!canUseToday('website')) {
    console.log(`[searchboard] website lookup skipped (daily cap) — "${name}"`);
    return '';
  }
  console.log(`[searchboard] looking up website for "${name}"…`);
  try {
    const res = await fetch('/api/find-website', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, industry, location })
    });
    if (!res.ok) {
      console.log(`[searchboard] website lookup failed (HTTP ${res.status}) — "${name}"`);
      return '';
    }
    const data = await res.json();
    recordUse('website');
    recordTokenUse('website', data._usage);
    const site = typeof data.website === 'string' ? data.website : '';
    if (site) {
      console.log(`[searchboard] ✓ website for "${name}": ${site}`);
    } else if (data._candidate) {
      console.log(
        `[searchboard] ✗ "${name}": model suggested ${data._candidate}, but it didn't load — left blank`
      );
    } else {
      console.log(`[searchboard] ✗ "${name}": couldn't determine an official site`);
    }
    return site;
  } catch {
    console.log(`[searchboard] website lookup errored — "${name}"`);
    return '';
  }
}

// Job ids already tried this session, so reopening a job doesn't re-infer.
const orgAttempted = new Set();

// Infer the hiring company (and its website) for a job that has no org, from
// whatever text the job carries. Returns { company, website } or null. Caller
// decides how to match/create the org. Respects the daily cap and de-dupes by
// job id.
export async function findOrg({ appId, title, link, location, notes, digest } = {}) {
  if (appId) {
    if (orgAttempted.has(appId)) return null;
    orgAttempted.add(appId);
  }
  if (!canUseToday('org')) {
    console.log('[searchboard] org lookup skipped (daily cap)');
    return null;
  }
  const label = title || link || 'this job';
  console.log(`[searchboard] inferring company for ${label}…`);
  try {
    const res = await fetch('/api/find-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, link, location, notes, digest })
    });
    if (!res.ok) {
      console.log(`[searchboard] org lookup failed (HTTP ${res.status}) for ${label}`);
      return null;
    }
    const data = await res.json();
    recordUse('org');
    recordTokenUse('org', data._usage);
    const company = typeof data.company === 'string' ? data.company.trim() : '';
    const website = typeof data.website === 'string' ? data.website : '';
    if (company) {
      console.log(
        `[searchboard] ✓ inferred org "${company}"${website ? ` (${website})` : ''} for ${label}`
      );
      return { company, website };
    }
    console.log(`[searchboard] ✗ couldn't infer a company for ${label}`);
    return null;
  } catch {
    console.log(`[searchboard] org lookup errored for ${label}`);
    return null;
  }
}

// A stored website may omit the scheme; ensure the href is absolute so it
// doesn't resolve relative to the app. Display it without the scheme/trailing
// slash to keep things tidy (e.g. show "acme.com", link to "https://acme.com").
export const withProtocol = url =>
  /^https?:\/\//i.test(url) ? url : `https://${url}`;
export const displayUrl = url =>
  url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
