# Spec — Import a role from an ATS URL (+ state-aware salary)

> Status: **implemented** (2026-06-21, commit `94f0fdb`). Shipped with three
> changes from the original proposal, noted inline: Ashby is in v1, the paste
> panel shows the URL field and textarea *together* (no toggle), and home state
> defaults to blank.

## Context

Paste-a-JD works today, but it requires copy/pasting the full description, and for long postings
the salary often sits past the input window (now mitigated by the 8k input cap). Two follow-on
improvements were requested:

1. **Import from a job-posting URL** instead of pasting text — e.g.
   `https://www.instacart.careers/job?gh_jid=7947506`.
2. **State-aware salary** — when a posting lists region-specific pay ranges and we know the user's
   home state (Colorado), return *that* range (`$243,000–$256,500`) instead of the current
   "varies by state" summary.

The hard constraint is VISION principle #6: the shared AI/proxy is "a privilege, not a blank
check." We must **not** turn `/api/parse` into an arbitrary URL fetcher (an SSRF vector and a
general scraping proxy on the shared key). LinkedIn is explicitly out of scope here — it needs auth
and blocks server fetches; that's the future browser-extension path.

**Key safety design:** the server **never fetches the user-supplied URL**. It parses the URL with
regex to extract `(provider, token, jobId)`, and only ever calls a **hardcoded allowlist of ATS API
hosts** (Greenhouse, Lever). If the URL doesn't match a known ATS, it's rejected with a "paste the
text instead" message — nothing is fetched. This eliminates SSRF by construction.

Validated during planning: `GET https://boards-api.greenhouse.io/v1/boards/instacart/jobs/7947506`
returns clean JSON (title, location, and a `content` field with the full JD incl. salary ranges).

## Part 1 — ATS URL import

### Providers (v1)

- **Greenhouse** — covers the Instacart case and most tech companies.
  - Canonical: `(job-)?boards.greenhouse.io/{board}/jobs/{id}` → token + id straight from the path.
  - Custom domain w/ `gh_jid` (e.g. `instacart.careers/job?gh_jid=7947506`): extract `id` from
    `gh_jid`, **derive the board token from the hostname's first label** (`instacart.careers` →
    `instacart`), then validate by calling the Greenhouse **API** (never the custom domain). If the
    derived token doesn't resolve, return a friendly fallback error.
  - API: `https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}` → `.title`,
    `.location.name`, `.content` (HTML-encoded; strip tags + decode entities to plain text).
- **Lever** — `jobs.lever.co/{org}/{id}` → `https://api.lever.co/v0/postings/{org}/{id}?mode=json`
  (`.text` / `.descriptionPlain`, `.categories.location`).
- **Ashby** *(shipped in v1)* — `jobs.ashbyhq.com/{org}/{job-uuid}[/application]`. Ashby has no
  single-posting endpoint, so we fetch the whole board
  `https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` and pick the job
  by id (carried through the resolver as `jobId`). Fields: `.title`, `.location`,
  `.descriptionPlain` (fallback `.descriptionHtml`), and `.compensation.compensationTierSummary`
  (appended to the description, since comp lives in a structured field, not the body). Note: Ashby
  exposes a single posted range, not per-region bands, so state-aware salary has nothing to select
  there — it returns that one range.

### Endpoint changes — `api/parse.js`

Extend the existing handler (the `{ text }` path stays unchanged):

- Accept `{ url }` as an alternative to `{ text }`.
- New helper `resolveAtsUrl(url)` (in `api/parse.js`, or a small `api/_ats.js` — the `_` prefix
  keeps it from being exposed as its own route): regex-match against the provider table → return
  `{ apiUrl, provider }` or `null`. Validate `token`/`id` are `[A-Za-z0-9_-]+` before interpolating
  into the API URL (no path injection). Returns `null` for anything off-allowlist.
- If `url` is given but `resolveAtsUrl` returns `null` → `400`
  `{ error: "That URL isn't from a supported job board (Greenhouse, Lever). Paste the description instead." }`
  — **no fetch**.
- Otherwise `fetch(apiUrl)` with a ~5s timeout (`AbortController`); on non-OK or timeout → `502`
  with the existing "enter manually" copy. Convert the JD `content` to plain text, then feed it into
  the **same** extraction call already in the file (reuse `SYSTEM_PROMPT` + the Anthropic request).
  Slice to the existing 8000-char cap.
- Rate limiting unchanged: a URL import is one Anthropic call, counted by the existing per-IP
  limiter and the client `canUseParseToday()` gate. The ATS GET is cheap and not separately capped.

### Client changes — `src/forms/ApplicationForm.jsx`

- In `PasteJdPanel`, show **both** a `url` input and the description textarea together (no toggle —
  changed from the original proposal). Parse whichever is filled; a URL takes priority and disables
  the textarea while present. "Fetch & fill" → `POST /api/parse { url }` or `{ text }`.
- Both modes: same `canUseParseToday()` gate, `recordParseUse()` on success, and `applyParsed()`
  (which already maps title/org/location/fit_notes/fit_score/salary).
- On successful URL import, also set the form's `link` field to the pasted URL (free metadata).
- On the unsupported-URL `400`, show an inline hint to switch to Paste-text mode.

## Part 2 — State-aware salary

### Home-state setting (portable, no store.js change)

- Store the user's home location at the **top level of the db** as `db.profile = { homeState }`.
  `store.js`'s `loadFromLocalStorage` does `{ ...emptyDB(), ...parsed }`, so an extra `profile` key
  round-trips through load/save and export/import without touching `store.js` (a fixed contract).
  New users: `db.profile` is `undefined` → guard with `db.profile?.homeState`.
- `src/lib/db.jsx`: add `setProfile(patch)` (a top-level `setDb` merge, sibling to the collection
  CRUD).
- `src/pages/Settings.jsx`: add a small **Profile** card — a "Home state / location" text field
  (e.g. `CO`) saved via `setProfile`. Explain it tailors salary extraction.

### Parse changes

- `ApplicationForm` sends `userState: db.profile?.homeState` with both text and URL parse requests.
- `api/parse.js`: accept optional `{ userState }`; append to `SYSTEM_PROMPT`: *if the posting lists
  location/state-specific pay ranges and a user state is provided, return the single range matching
  that state; otherwise summarize the range(s) concisely.* Pass `userState` to the model (e.g. as a
  prefix line on the user message). With `userState: "CO"`, Instacart's
  `…CO, TX, IL, HI → $243,000-$256,500` line is selected.
- Privacy: only a short state string leaves the browser, transiently, alongside the JD — consistent
  with the existing transient-text model. Document inline.

## Files touched

| File | Change |
|------|--------|
| `api/parse.js` | `{ url }` + `{ userState }` support, `resolveAtsUrl` allowlist, ATS fetch + HTML strip, prompt update |
| `src/forms/ApplicationForm.jsx` | URL/text toggle in `PasteJdPanel`; send `userState`; set `link` |
| `src/lib/db.jsx` | `setProfile` |
| `src/pages/Settings.jsx` (+ `.module.css`) | Profile / home-state field |
| `src/lib/store.js` | **unchanged** |
| `api/_ats.js` *(optional)* | resolver + provider table, if extracted from `parse.js` |

## Verification

Run via `set -a; source .env.local; set +a; vercel dev --listen 3000`.

- **Happy path:** URL-import `https://www.instacart.careers/job?gh_jid=7947506` → form fills
  title/org/location/fit_notes/score, `link` set; with Home state = `CO`, salary reads
  `$243,000-$256,500` (not "varies by state").
- **Canonical + Lever:** test a `boards.greenhouse.io/{board}/jobs/{id}` URL and a
  `jobs.lever.co/{org}/{id}` URL.
- **SSRF / allowlist:** `POST /api/parse {url:"http://169.254.169.254/latest/meta-data"}` and a
  random blog URL → both `400`, **no outbound fetch** (verify via logs). Confirm the server only
  ever hits `boards-api.greenhouse.io` / `api.lever.co`.
- **Rate limit:** a URL import decrements the daily allowance like a paste does.
- **No-state fallback:** clear Home state → salary returns the "varies by state" summary as today.
- **Portability:** Settings → Export JSON includes `profile.homeState`; Import restores it.
- `npm run build` clean; redeploy needed for the `api/parse.js` change to reach production.

## Out of scope

LinkedIn / arbitrary-URL fetch (needs the browser-extension path), auto-detecting home state from
anything other than the Settings field.

## Decisions (resolved at build)

1. **Paste-panel layout** — URL field and textarea shown *together*, parse whichever is filled (no
   mode toggle).
2. **Providers in v1** — Greenhouse + Lever + Ashby.
3. **Home state** — defaults to blank; the user sets it in Settings → Profile.
