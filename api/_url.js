// api/_url.js
//
// Shared URL helpers for the enrichment endpoints (find-website, find-org):
// normalize a model-provided website to a bare http(s) origin, and best-effort
// verify it resolves so we never persist a dead link.

const VERIFY_TIMEOUT_MS = 4000;

// Coerce a model-provided string to an http(s) origin (scheme added if missing,
// any path/query dropped). Returns '' if it isn't a usable http(s) URL.
export function normalizeWebsite(raw) {
  let website = (raw || '').trim();
  if (!website) return '';
  if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
  try {
    const u = new URL(website);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : '';
  } catch {
    return '';
  }
}

// Best-effort reachability check. A hard connection/DNS failure means the
// domain almost certainly doesn't exist, so callers drop the guess. Any HTTP
// response (even 403/404) counts as "exists" — plenty of sites block bots.
export async function resolves(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SearchboardBot/1.0)' }
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
