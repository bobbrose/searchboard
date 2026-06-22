# Searchboard

A local-first dashboard for a deliberate, research-heavy job search. You track each **job** through its stages and score it against **your own explicit Fit Criteria** — so "should I pursue this?" is a written, repeatable judgment instead of a gut feel you re-derive every time.

See [`VISION.md`](./VISION.md) for the full product vision and scope.

## Status

Built and deployed. The core is in daily use: the Jobs board (kanban + list), the Fit Criteria editor, on-demand fit scoring, résumé-seeded criteria, Orgs, Contacts, and JSON export/import. Analysis and Action Items exist in the data model and code but aren't currently surfaced in the nav (Action Items is planned to return — see VISION).

## What it does

- **Jobs** — the full-screen home. Track roles by stage in a kanban or list view; moving one into *Applied* stamps the applied date automatically.
- **Fit Criteria** — a living profile of what you want next: **hard filters** (comp floor, remote, excluded domains, IC-coding balance) checked instantly in your browser, and **soft preferences** the AI weighs. Can be seeded from your résumé.
- **Fit scoring** — score any job on demand against your criteria. Returns a two-axis verdict: *fit* (close / partial / miss) and recommended *action* (apply / wait / pass), with short per-dimension reasoning. Hard-filter trips are decided in-browser with no AI call.
- **Orgs & Contacts** — the companies you're evaluating and the people you're building relationships with, linked back to jobs. Reached from the hamburger menu.
- **Paste-to-populate** — paste a job description (or a Greenhouse/Lever posting URL) and have the fields filled in.
- **Share a job** — a single job serialized into a self-contained, read-only link. No server storage.

## Architecture at a glance

- **Frontend**: Vite + React (React Router), deployed as a static site on Vercel.
- **Backend**: a small set of Vercel serverless functions that hold the Anthropic API key server-side and each proxy one narrowly-scoped task:
  - `api/parse.js` — extract structured fields from a pasted JD (or resolve a Greenhouse/Lever URL via the allowlisted resolver in `api/_ats.js`; the server never fetches arbitrary user URLs).
  - `api/score-fit.js` — personalized fit scoring from your criteria + a JD.
  - `api/parse-resume.js` — turn a pasted résumé into seed values for your Fit Criteria.
  - Shared helpers: `api/_ratelimit.js` (best-effort per-IP cap) and `api/_ats.js`.
- **Rate limiting**: a daily cap per browser for each task (`parse` 15, `score` 25, `resume` 5 — see `DAILY_LIMITS` in `src/lib/store.js`), backed by the server-side per-IP limiter.
- **Storage**: no database, no accounts. All tracking data lives in the browser's localStorage and in the JSON file you export/import. The AI endpoints only ever see pasted text (JD or résumé) transiently — never stored, never logged.
- **Share-a-job**: a single job record is base64-encoded into a URL query parameter (`encodeShareableApp` / `decodeShareableApp` in `src/lib/store.js`) — no server storage involved.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in ANTHROPIC_API_KEY (unquoted)
npx vercel dev                # runs the Vite frontend and /api functions together
```

Plain `npm run dev` (Vite only) runs the UI, but the AI calls will fail — use `vercel dev` for the full stack locally.

Two gotchas worth knowing:
- If the project is linked to Vercel (`vercel link`), `vercel dev` pulls function env from the cloud **Development** environment and ignores `.env.local` — set `ANTHROPIC_API_KEY` there.
- Store the key **unquoted**; a quoted value is passed literally and yields a 401.

## Deployment

Connected to Vercel. Push to `main` to deploy. Set `ANTHROPIC_API_KEY` in the Vercel project's Environment Variables (never commit it).

## Repo

https://github.com/bobbrose/searchboard
