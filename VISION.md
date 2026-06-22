# Vision: Searchboard

## Problem

A deliberate, research-heavy job search runs on one question, asked over and over: **does this role actually fit what I want next?** Not "am I qualified" — "is this worth my time, given my comp floor, the kind of work I want, the domains I'll and won't touch, and the deal-breakers I keep re-explaining to recruiters."

In practice that judgment is implicit and scattered. The criteria live in your head and drift; you re-litigate the same trade-offs on every posting; the reasoning behind "I passed on that one" evaporates. Generic job-search CRMs (Huntr, Teal, Careerflow) track *stages and dates* well but treat fit as a vibe — a star rating at best. Notes apps hold reasoning but have no concept of a pipeline to anchor it to. Nothing makes your own criteria explicit and then scores each role against them, consistently, so the judgment is written down and repeatable.

Around that core sit the supporting facts of a real search: the **organizations** you're evaluating, the **contacts** you're building relationships with, the **analysis** you accumulate, and the **action items** you owe people. They matter — but they orbit the central act of judging fit.

## Who this is for

People doing a **deliberate, research-heavy job search** — not high-volume "spray and pray" applying. The kind of search where you have specific, non-obvious criteria (a comp floor, a leadership-vs-hands-on-coding balance, domains you'll avoid), you're evaluating organizational fit, you're building real relationships, and you want a written trail of your own thinking so you can act on it consistently. Initially: one person (you), shared with friends and family. Eventually: anyone who searches this way.

## What it is

A single-page web app, no login required, built around **Jobs scored against your explicit Fit Criteria**:

- **Jobs** — the full-screen home. Roles tracked by stage in a kanban or list view, each carrying its fit verdict. Paste a job description (or a Greenhouse/Lever URL) to populate the fields.
- **Fit Criteria** — a living profile of what you want next, edited any time:
  - **Hard filters** (comp floor, remote requirement, excluded domains, IC-coding balance, location exceptions) — deal-breakers checked **instantly in your browser** before any AI call, so a role that trips one is marked "pass" for free.
  - **Soft preferences** (product-vs-infra leaning, company attributes, differentiators, red-flag patterns) — judgment calls the AI weighs.
  - Seedable from a pasted résumé.
- **Fit scoring** — on demand, score any job against your criteria. The result is a two-axis verdict — *fit* (close / partial / miss) and recommended *action* (apply / wait / pass) — with short, per-dimension reasoning, like a trusted recruiter's honest read. Action can diverge from fit (a great role with a red flag; a partial fit worth applying anyway), and when it does, the reasoning says why.
- **Orgs & Contacts** — the companies you're evaluating and the people in your search, linked back to jobs. Reached from the hamburger menu, alongside Fit Criteria and Settings.

It is local-first: your data is a JSON file you control. Export to back up or move devices, import (merge) to combine, or paste raw text to start populating. No account, no database, no server-side storage of your personal tracking data.

The one exception: shared, rate-limited AI endpoints (see Architecture) so anyone can try the paste-to-populate, fit-scoring, and résumé-seeding flows without their own API key. Only the pasted text passes through, transiently — never logged or stored.

## What it is not

- Not a job board or listing aggregator — it doesn't crawl postings for you (it can resolve a Greenhouse/Lever URL you paste, nothing more).
- Not a multi-user collaboration tool — it's single-player, file-based.
- Not an applicant tracking system for *employers* — despite the acronym overlap, this tracks *your* jobs, not candidates.

## Core principles

1. **Fit is explicit and scored, not a vibe.** Your criteria are written down and every role is judged against *them* — never a judgment of you or the role, just the degree of overlap, and why.
2. **Cheap judgments happen in the browser.** Hard filters are pure-client checks; the shared AI key is spent only on the soft, contextual calls a boolean can't make.
3. **Your data is a file, not a database row.** Privacy by architecture, not by policy.
4. **No login.** Friction-free for anyone to try.
5. **Useful immediately, sheddable later.** Stop using it and your data is a portable JSON file — not lock-in.
6. **Shared AI access is a privilege, not a blank check.** Rate-limited, scoped to a few cheap tasks (structured extraction, fit scoring, résumé seeding), never open-ended chat, never storing what's parsed, and never fetching arbitrary user-supplied URLs.

## Architecture

- **Frontend**: static React app (Vite + React Router), deployed on Vercel.
- **Backend**: small Vercel serverless functions holding the Anthropic API key server-side, each a single tightly-scoped prompt — never open-ended chat:
  - `/api/parse` — extract structured fields from a JD (or an allowlisted Greenhouse/Lever URL).
  - `/api/score-fit` — personalized fit verdict from criteria + JD.
  - `/api/parse-resume` — résumé → Fit Criteria seed values.
- **Rate limiting**: a daily cap per browser for each task, backed by a best-effort server-side per-IP limiter, so the shared key can't be drained by one bad actor or a link going viral.
- **Storage**: none server-side. Export/import JSON to persist, move, or merge; paste raw text to start fresh.
- **Share-a-job**: a single job record is base64-encoded into a URL query parameter; opening the link renders a read-only view — no server storage, consistent with the file-not-database principle.
- **Repo**: GitHub.

## Current state

- **Built and in use**: Jobs (kanban + list, auto applied-date), Fit Criteria editor, on-demand fit scoring, résumé seeding, Orgs, Contacts, paste-to-populate (incl. ATS URL), share-a-job, JSON export/import (merge).
- **In the model but not surfaced**: Analysis still accrues — each fit scoring writes a timeline entry — but there's no dedicated Analysis page in the current nav. The page code exists, unrouted.
- **Planned to return**: Action Items (time-sensitive TODOs surfaced by urgency). Dropped from the nav during the Jobs-first revamp; the page code is kept on disk to re-add.

## Later (not now)

- Re-surface Action Items (and optionally a Dashboard/Analysis view) once the Jobs-first layout settles.
- Google Drive sync as an optional connected storage layer (real OAuth).
- BYO-key option if shared-key usage grows past what's comfortable to subsidize.
- Multi-user / shareable boards (e.g., a mentor reviewing your pipeline).
- Browser extension for one-click capture from LinkedIn/job boards.
- Notifications/reminders for overdue action items.

## Open questions

- Exact daily rate-limit numbers (start conservative, watch real usage, adjust).
- How much should the public version know it was inspired by a personal search, vs. presenting as a generic tool for anyone?
- Whether Analysis returns as its own surface or stays folded into fit history.
