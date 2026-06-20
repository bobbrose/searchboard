# Searchboard

A local-first dashboard for a deliberate, research-heavy job search — applications, organizations, contacts, analysis, and action items in one place.

See [`VISION.md`](./VISION.md) for the full product vision and v1 scope.

## Status

Early scaffold. Data layer (`src/lib/store.js`) and the `/api/parse` serverless function are built. The real dashboard UI (Applications kanban, Orgs, Contacts, Analysis, Action items) still needs to be built — `src/App.jsx` is currently a minimal placeholder that proves the data layer wires up.

## Architecture at a glance

- **Frontend**: Vite + React, deployed as a static site on Vercel
- **Backend**: a single serverless function, `api/parse.js`, which holds the Anthropic API key server-side and proxies a narrowly-scoped "extract structured fields from this job posting" request. Rate-limited per IP (server-side) and per browser (client-side, see `canUseParseToday()` in `src/lib/store.js`).
- **Storage**: no database, no accounts. All tracking data lives in the browser's localStorage and as a JSON file you export/import. The `/api/parse` endpoint only ever sees the pasted job description text, transiently, never stored.
- **Share-a-role**: a single application record is base64-encoded into a URL query parameter (`encodeShareableApp` / `decodeShareableApp` in `src/lib/store.js`) — no server storage involved.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in ANTHROPIC_API_KEY
npx vercel dev                # runs both the Vite frontend and /api functions together
```

Plain `npm run dev` (Vite only) will run the UI but `/api/parse` calls will fail — use `vercel dev` for the full stack locally.

## Deployment

Connected to Vercel, pointed at `searchboard.dev`. Push to `main` to deploy. Set `ANTHROPIC_API_KEY` in the Vercel project's Environment Variables (never commit it).

## Repo

https://github.com/bobbrose/searchboard
