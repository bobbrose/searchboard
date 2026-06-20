# Vision: Job Search Dashboard (working title)

## Problem

Job searching generates four kinds of information that currently live in disconnected places:

1. **Structured tracking data** — applications, stages, contacts, dates — usually shoved into a spreadsheet
2. **Analysis** — research on an org before you apply, fit reasoning, interview prep, strategic thinking, and the judgment calls that come after a touchpoint: how did that screen actually go, what did you learn, do you still want this one, what homework do you owe yourself before the next round. Without a place for this, the post-interview read either evaporates or gets buried in an email thread you'll never reopen
3. **Action items** — the concrete, time-sensitive things you owe someone: write a cover letter, send a recruiter your salary requirements, follow up after an interview, prep for a call Thursday. These are different from tracking data because they're urgent and have a clear cost of failure — a stale pipeline stage is just untidy, a dropped action item can cost you the role or the relationship
4. **The connective tissue between all of the above** — *why* this contact matters to *that* application, what an org's analysis concluded and whether it should change your next move, which open action item is blocking which application from progressing, and whether last week's interview debrief should change this application's stage or priority

No existing tool holds all four together. Job-search CRMs (Huntr, Teal, Careerflow) handle #1 well and sometimes bolt on basic reminders, but treat analysis and action items as afterthought fields, not first-class, surfaced objects. Generic notes apps and to-do lists handle #2 and #3 separately but have no concept of an application or a pipeline to anchor them to. Nothing connects all three to each other.

## Who this is for

People doing a **deliberate, research-heavy job search** — not high-volume "spray and pray" applying. The kind of search where you're evaluating organizational fit, building real relationships with contacts, and want a written trail of your own thinking so you can act on it consistently. Initially: one person (you), shared with friends and family. Eventually: anyone who searches this way.

## What it is

A single-page web app, no login required, that gives you one dashboard for:
- **Applications** — tracked by stage, with fit notes attached
- **Organizations** — research and analysis on each org you're evaluating
- **Contacts** — people, relationship type, and follow-up status
- **Analysis** — research and debrief entries, explicitly tagged by moment (*pre-application research*, *post-interview debrief*, *strategy note*, *conversation summary*, *other*), linkable to an org and/or application
- **Action items** — time-sensitive TODOs with due dates, linkable to an application/org/contact, surfaced by urgency

It is local-first: your data is a JSON file you control. Upload it to resume a session, download it to save, or paste raw text (a job description, notes) to start populating fresh. No account, no database, no server-side storage of your personal tracking data.

The one exception: a shared, rate-limited AI parsing endpoint (see Architecture) so anyone can try the "paste a JD and have it parsed" flow without needing their own API key. Only the JD text passes through this endpoint, transiently, and it is not logged or stored.

## What it is not

- Not a job board or listing aggregator — it doesn't crawl job postings for you
- Not a multi-user collaboration tool (v1) — it's single-player, file-based
- Not an applicant tracking system for *employers* — despite the acronym overlap, this tracks *your* applications, not candidates

## Core principles

1. **Your data is a file, not a database row.** Privacy by architecture, not by policy.
2. **Analysis is a first-class object**, not a notes field bolted onto a tracker.
3. **Action items are surfaced, not buried.** Shown prominently on the dashboard, sorted by urgency, not a checkbox list you have to go looking for.
4. **No login for v1.** Friction-free for anyone to try.
5. **Useful immediately, sheddable later.** If you stop using it, your data is a portable JSON file you can take anywhere — not lock-in.
6. **Shared AI access is a privilege, not a blank check.** Rate-limited, scoped to one cheap task (structured extraction), never open-ended chat, never storing what's parsed.

## Architecture

- **Frontend**: static React app (Vite), deployed on Vercel
- **Backend**: one Vercel serverless function (`/api/parse`) holding the Anthropic API key server-side. Proxies a single, tightly-scoped prompt — "extract structured fields from this job description" — never open-ended chat. This keeps cost per-call small and predictable (validated by real-world precedent: plantpicker.app runs a similar shared-key, no-login model at a few dollars a month).
- **Rate limiting**: a daily cap per browser (local token) backed by a server-side IP-based limit, so the shared key can't be drained by one bad actor or a link going viral.
- **Storage**: none server-side. Upload/download JSON to persist or resume a session. Paste raw text to start fresh.
- **Share-a-role**: a single application/org record is serialized and base64-encoded into a URL query parameter. Opening the link renders a read-only view — no server storage involved, consistent with the file-not-database principle.
- **Repo**: GitHub (your account)

## V1 scope

- Add/edit applications, orgs, contacts
- Analysis entries with an explicit moment/type field, linkable to an org and/or application
- Action items: title, due date, linked entity, done/not-done; dashboard view sorted by urgency, overdue first
- Kanban + list views for applications
- Paste-to-populate from raw JD text via the shared, rate-limited `/api/parse` endpoint
- Upload/download JSON to persist a session
- Share a single role via a self-contained link (no server storage)
- Deployed, shareable URL, works on desktop and mobile browsers

## Later (not v1)

- Google Drive sync as an optional connected storage layer (real OAuth)
- BYO-key option if shared-key usage grows past what's comfortable to subsidize
- Multi-user / shareable boards (e.g., a mentor reviewing your pipeline)
- Browser extension for one-click capture from LinkedIn/job boards
- Notifications/reminders for overdue action items

## Open questions

- Final product name and domain
- Exact daily rate-limit number (start conservative, watch real usage, adjust)
- How much should the public version know it was inspired by your own search, vs. presenting as a generic tool for anyone?
