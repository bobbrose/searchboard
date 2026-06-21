// api/_ratelimit.js
//
// Shared best-effort per-IP rate limiter for the Anthropic-backed endpoints.
// NOTE: Vercel serverless functions are stateless per-instance, so this resets
// on cold starts and isn't shared across regions/instances — a backstop, not a
// guarantee. Combined with the client-side daily caps it's enough for a
// friends-and-family scale tool. If usage grows, swap the Map for Upstash Redis.
//
// Each endpoint owns its own bucket (a named Map) so /api/parse and
// /api/score-fit don't share a counter — see the limit table in
// docs/fit-criteria-profile-spec.md.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const buckets = new Map(); // bucketName -> Map(ip -> timestamps[])

// Returns true if this request puts `ip` over `maxPerHour` for `bucket`.
export function isRateLimited(bucket, ip, maxPerHour) {
  let log = buckets.get(bucket);
  if (!log) {
    log = new Map();
    buckets.set(bucket, log);
  }
  const now = Date.now();
  const timestamps = (log.get(ip) || []).filter(t => now - t < WINDOW_MS);
  timestamps.push(now);
  log.set(ip, timestamps);
  return timestamps.length > maxPerHour;
}

// Pull the caller IP from the usual proxy headers.
export function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}
