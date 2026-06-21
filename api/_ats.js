// api/_ats.js
//
// ATS URL resolver for the "import from a job-posting URL" flow.
//
// SAFETY (VISION principle #6 — the shared key is "a privilege, not a blank
// check"): the server NEVER fetches the user-supplied URL. We parse the URL
// with regex to extract (provider, token, id) and only ever build URLs against
// a hardcoded allowlist of ATS API hosts (Greenhouse, Lever). Anything that
// doesn't match a known ATS resolves to null and is rejected upstream with a
// "paste the text instead" message — nothing is fetched. This eliminates SSRF
// by construction.
//
// The leading `_` keeps this off Vercel's filesystem routing — it's a helper,
// not its own endpoint.

// Only [A-Za-z0-9_-] is ever interpolated into an API URL, so a malicious URL
// can't inject path segments or a different host.
const SAFE = /^[A-Za-z0-9_-]+$/;

function safe(...parts) {
  return parts.every(p => typeof p === 'string' && SAFE.test(p));
}

// Resolve a user-supplied job-posting URL to a trusted ATS API URL.
// Returns { apiUrl, provider } on a match, or null for anything off-allowlist.
export function resolveAtsUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  // --- Greenhouse -----------------------------------------------------------
  // Canonical: (job-)?boards.greenhouse.io/{board}/jobs/{id}
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    const m = path.match(/^\/([^/]+)\/jobs\/([^/?#]+)/);
    if (m && safe(m[1], m[2])) {
      return {
        provider: 'greenhouse',
        apiUrl: `https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}`
      };
    }
    return null;
  }

  // Custom domain w/ ?gh_jid= (e.g. instacart.careers/job?gh_jid=7947506):
  // take the id from gh_jid and derive the board token from the hostname's
  // first label (instacart.careers -> instacart). Validity is confirmed by the
  // Greenhouse API call itself — we never touch the custom domain.
  const ghJid = url.searchParams.get('gh_jid');
  if (ghJid) {
    const board = host.replace(/^www\./, '').split('.')[0];
    if (safe(board, ghJid)) {
      return {
        provider: 'greenhouse',
        apiUrl: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${ghJid}`
      };
    }
    return null;
  }

  // --- Lever ----------------------------------------------------------------
  // jobs.lever.co/{org}/{id} -> api.lever.co/v0/postings/{org}/{id}?mode=json
  if (host === 'jobs.lever.co') {
    const m = path.match(/^\/([^/]+)\/([^/?#]+)/);
    if (m && safe(m[1], m[2])) {
      return {
        provider: 'lever',
        apiUrl: `https://api.lever.co/v0/postings/${m[1]}/${m[2]}?mode=json`
      };
    }
    return null;
  }

  // --- Ashby ----------------------------------------------------------------
  // jobs.ashbyhq.com/{org}/{job-uuid}[/application]. Ashby's public posting API
  // has no single-posting endpoint — it returns the whole board, so we fetch
  // that and pick the job by id (carried as jobId).
  if (host === 'jobs.ashbyhq.com') {
    const m = path.match(/^\/([^/]+)\/([^/?#]+)/);
    if (m && safe(m[1], m[2])) {
      return {
        provider: 'ashby',
        jobId: m[2],
        apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${m[1]}?includeCompensation=true`
      };
    }
    return null;
  }

  return null;
}

// Turn an ATS API JSON payload into a single plain-text blob for extraction.
// Each provider exposes the JD differently; we normalize to
// "Title …\nLocation …\n\n<description>" so the model always sees title +
// location even when they live in structured fields rather than the body.
export function atsPayloadToText(provider, data, jobId) {
  if (provider === 'greenhouse') {
    const title = data.title || '';
    const location = data.location?.name || '';
    const body = htmlToText(data.content || '');
    return joinPosting(title, location, body);
  }
  if (provider === 'lever') {
    const title = data.text || '';
    const location =
      data.categories?.location || data.workplaceType || '';
    // descriptionPlain is already plain text; fall back to stripping the HTML.
    const body = data.descriptionPlain || htmlToText(data.description || '');
    return joinPosting(title, location, body);
  }
  if (provider === 'ashby') {
    // data is the whole board listing; pick the one job by id.
    const job = (data.jobs || []).find(j => j.id === jobId);
    if (!job) return '';
    const title = job.title || '';
    const location = job.location || job.workplaceType || '';
    const body = job.descriptionPlain || htmlToText(job.descriptionHtml || '');
    // Comp lives in a structured field, not the description — append it so the
    // extractor (and state-aware salary) can see it.
    const comp =
      job.compensation?.compensationTierSummary ||
      job.compensation?.scrapeableCompensationSalarySummary ||
      '';
    return joinPosting(title, location, comp ? `${body}\n\nCompensation: ${comp}` : body);
  }
  return '';
}

function joinPosting(title, location, body) {
  const head = [
    title && `Title: ${title}`,
    location && `Location: ${location}`
  ]
    .filter(Boolean)
    .join('\n');
  return [head, body].filter(Boolean).join('\n\n').trim();
}

// Minimal HTML -> text: decode the common entities, drop tags, collapse
// whitespace. Greenhouse `content` arrives HTML-encoded (entities), so we
// decode first, then strip. Good enough for feeding a JD to the extractor.
export function htmlToText(html) {
  if (!html) return '';
  return decodeEntities(html)
    .replace(/<\s*(br|\/p|\/li|\/h[1-6]|\/div)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodeEntities(s) {
  const named = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' '
  };
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, m => named[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
