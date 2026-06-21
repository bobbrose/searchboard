# Spec — Personalized fit-criteria profile + scoring

> Status: **implemented** (2026-06-21). Built on top of the shipped `db.profile`
> from `ats-url-import-spec.md`. All four open decisions resolved at build — see
> the "Decisions" section. Scoring runs on the shared server-side key (the
> owner's own), not a BYO-key; scoring auto-runs after each parse.

## Context

Today, `/api/parse` extracts generic fields from a pasted JD — title, org, location, salary, and a
`fit_score` that's explicitly *not* personal ("a rough generic estimate of role seniority/scope,
not a personal fit judgment since you don't know the applicant"). That's correct scoping for a
shared, unauthenticated endpoint with no concept of who's asking.

But the actual value of a deliberate, research-heavy job search — the thing Huntr/Teal/Careerflow
don't do, per `VISION.md`'s problem statement — is evaluating a role against *your specific*
criteria: comp floor, domain exclusions, leadership-vs-IC balance, the kind of work you actually
want next. That requires the tool to know something about the user. Right now it knows nothing.

This spec adds that: a structured, portable criteria profile (`db.profile`), three ways to capture
and refine it over time, and a new scoped endpoint that produces a personalized fit verdict using
the same evaluation framework already used informally — people-leadership primacy → domain fit →
comp range → stack alignment → red-flag check.

**Relationship to `ats-url-import-spec.md`:** that spec proposes `db.profile = { homeState }` as a
minimal first slice of exactly this idea. This spec is the superset — same `db.profile` key, same
round-trip mechanism (`{ ...emptyDB(), ...parsed }` in `store.js`, untouched), same "Profile" card
location in Settings. If the ATS spec lands first, this spec extends `homeState` in place. If this
lands first, `homeState` is just one more field in the schema below. Either order works; they
should not both invent a competing `setProfile` — one implementation, shared.

## Core design decision: hard filters vs. soft signals

Not everything the user tells us should be evaluated by the model. Splitting the profile into two
tiers keeps cost down and keeps rejections instant and explainable:

- **Hard filters** — deterministic, binary, checked **client-side, before any API call**. Comp
  below floor, an excluded domain keyword, a disallowed location/work-mode. If a hard filter trips,
  the role gets an instant "Pass" with a plain-English reason — zero Anthropic calls spent. This is
  also a VISION principle #6 fit: "shared AI access is a privilege, not a blank check" — don't spend
  the shared key's budget on a role that was always going to fail a yes/no check.
- **Soft signals** — require judgment, can't be reduced to a boolean. Product-vs-infra orientation,
  "AI-first or mission-driven" company type, known red-flag *patterns* in JD language (as opposed
  to a keyword match). These get fed to the model as context for the actual scoring call.

## Part 1 — Profile schema (`db.profile`)

Extends the `homeState` field already proposed; same shallow-merge round-trip, no `store.js`
change required (an extra top-level key always survives load/save/export/import).

```js
db.profile = {
  homeState: 'CO',

  targetTitles: ['Senior Engineering Manager', 'Director of Engineering'],

  hardFilters: {
    compFloor: 225000,                      // number, USD base; null = no floor set
    domainExclusions: ['martech', 'engagement', 'notifications', 'crypto'],
    remoteRequired: true,
    relocationExceptions: ['Seattle'],       // cities where in-person is acceptable anyway
    maxIcCodingPercent: 50                   // null = no IC-coding ceiling set
  },

  softPreferences: {
    productVsInfra: 'product-focused, full-stack — leaning away from infra-only mandates',
    companyType: 'AI-first or mission-driven',
    notes: ''                                // freeform, append-only via inline refinement (Part 2.3)
  },

  differentiators: [
    // short bullets — dual-purpose: fed to the scorer as positioning context,
    // and reusable verbatim as cover-letter hook material
  ],

  redFlagPatterns: [
    // phrases describing a *pattern* to watch for, not a keyword to match —
    // e.g. "hidden IC coding expectations in EM/Director titles"
  ],

  updatedAt: null   // ISO string, bumped by setProfile
};
```

All fields optional / nullable. A brand-new user has `db.profile === undefined`; every reader
guards with `db.profile?.field` exactly as the ATS spec already does for `homeState`.

### `src/lib/db.jsx` change

Add one function, sibling to the existing collection CRUD:

```js
function setProfile(patch) {
  setDb(prev => ({
    ...prev,
    profile: { ...prev.profile, ...patch, updatedAt: now() },
    lastSaved: now()
  }));
}
```

Shallow-merge at the top level only. Nested objects (`hardFilters`, `softPreferences`) should be
passed whole on update from the form layer (read-modify-write the nested object client-side), not
deep-merged here — keeps `db.jsx` generic and boring, consistent with how `update()` already works
for collections.

## Part 2 — Capturing the profile (three mechanisms, not one)

A single first-run wizard captures Day 1 thinking. Criteria drift as you see real roles and learn
what you actually want — that's a feature of a real search, not noise to suppress. So:

### 2.1 — First-run setup wizard (optional, skippable)

New component, `src/components/ProfileSetup.jsx`, shown once when `db.profile` is `undefined` (a
banner/modal on `Dashboard.jsx`, dismissable, re-openable from Settings). Short — 3–4 steps reusing
existing form patterns from `src/forms/`:

1. Target — `targetTitles` (tag input)
2. Hard filters — `compFloor`, `domainExclusions` (tag input), `remoteRequired` (toggle),
   `relocationExceptions` (tag input), `maxIcCodingPercent` (number)
3. Differentiators — freeform list, "what makes you a strong candidate"
4. Soft preferences — `productVsInfra`, `companyType` (short freeform fields, not a rigid enum —
   these are read by the model, not pattern-matched by code)

Skipping leaves `db.profile` as `{}`; the scorer (Part 3) degrades gracefully — see fallback note
there.

### 2.2 — Living profile in Settings

`src/pages/Settings.jsx` gets a **"Search Criteria"** card — same spot the ATS spec already plans
for the `homeState` field, expanded to the full schema. This is the source of truth; the wizard is
just how it gets seeded. Standard form, `setProfile()` on save, no modal/wizard chrome.

### 2.3 — Inline refinement, attached to a fit verdict

The most important of the three, and the one a static settings page can't replace. When a scored
verdict (Part 3) comes back and the user reacts — *"actually, steer me toward product roles, not
infra"* — that correction should be one click from where the reaction happens, not a trip to
Settings.

Concretely: wherever a fit-scoring result is displayed (an `Analysis` entry — see Part 3.3), add a
small **"Refine my criteria"** action that opens an inline text input. On submit, it appends a
timestamped line to `db.profile.softPreferences.notes` via `setProfile()` and re-runs scoring for
that one application if the user wants. This is the same shape as a correction in an ongoing
conversation — cheap, in-context, low-friction — and it's realistically where most of the profile's
useful content will come from over the course of a real search, not the Day 1 wizard.

## Part 3 — Personalized fit scoring

### 3.1 — New endpoint: `/api/score-fit.js`

Deliberately **not** an extension of `/api/parse` — that endpoint's scope is "extract structured
fields, no personal judgment," and should stay that narrow per its own comment block. Scoring is a
different task with a different (larger, more personal) input, so it gets its own file, its own
rate-limit bucket, and its own system prompt:

```
Request:  { jdText: string, profile: object }
Response: {
  verdict: 'pass' | 'conditional' | 'apply',
  priority: 'low' | 'medium' | 'medium-high' | 'high',
  reasoning: {
    peopleLeadership: string,
    domainFit: string,
    comp: string,
    stackAlignment: string,
    redFlags: string
  },
  coverLetterHook: string   // empty string if verdict is 'pass'
}
```

System prompt encodes the same five-stage framework already used informally: people-leadership
primacy → domain fit → comp range → stack alignment → red-flag check. Each `reasoning` field is
2–3 sentences, plain language, matching the tone already used in `fit_notes` from `/api/parse`.

### 3.2 — Client-side pre-check (before the API call fires)

`hardFilters` are evaluated in the browser first:

- Parsed salary (from `/api/parse`'s `salary` field, if available) below `compFloor` → instant
  `pass`, reasoning: `"Below your stated comp floor of $X"`. No API call.
- JD text containing a `domainExclusions` term in a strong position (title or first paragraph) →
  flag as likely-pass *suggestion*, but since this is a weak heuristic (a false positive costs an
  API call, a false negative costs nothing — scoring still runs and catches it via reasoning) this
  one should **not** hard-block the call, just pre-fill a warning banner the user can dismiss.
- True hard blocks (cheap, unambiguous): salary check above, and explicit `remoteRequired` vs. a
  detected "Hybrid"/"On-site" string outside `relocationExceptions`.

This keeps the obviously-disqualified roles free and instant, and reserves the model call for
roles where judgment actually adds value — which is most of them, since comp/location are usually
stated plainly but domain/stack/leadership fit are not.

### 3.3 — Where it's surfaced

A scoring run creates an `Analysis` entry (reusing the existing first-class object — `VISION.md`
principle #2, "analysis is first-class, not a notes field bolted on"), tagged with a new
`ANALYSIS_TYPES` value, `'Fit scoring'`, linked to the `app`/`org` like any other analysis entry.
This means a scored verdict has a permanent place in the timeline next to the post-interview
debrief and strategy notes it'll later be read alongside — not a transient toast that disappears.

Add `'Fit scoring'` to the `ANALYSIS_TYPES` array in `store.js` (additive, no migration needed for
existing saved files since unknown types just render as plain text already).

Surfaced from `src/forms/ApplicationForm.jsx`, next to the existing `PasteJdPanel`: after a JD is
parsed (Part 1's generic extraction), a **"Score this against my criteria"** button appears if
`db.profile` has at least `hardFilters` or `softPreferences` set. Calls `/api/score-fit`, writes
the `Analysis` entry, and shows the verdict inline in the form.

## Part 4 — Open privacy question (flagging, not resolving)

`homeState` is a low-sensitivity two-letter string. A full criteria profile — comp floor, career
positioning, differentiators — is a meaningfully larger and more personal payload to send to the
shared, unauthenticated key, even transiently and even unlogged. Two options, not resolved here:

- **(a)** Treat it the same as `homeState` — transient, unlogged, consistent with the existing
  trust model, document it plainly in the UI ("only sent for this scoring request, never stored").
- **(b)** Gate `/api/score-fit` specifically behind a BYO-key requirement (Settings → optional
  `ANTHROPIC_API_KEY` field, stored in `localStorage` only, sent as a header the serverless function
  forwards rather than using the shared server-side key) — `/api/parse`'s generic extraction stays
  on the shared key either way, only the personalized call requires the user's own key.

**Resolved: (a).** The shared key is the owner's own, and this is a single-player tool, so the
"more personal payload" concern is moot — it's the owner's data going to the owner's key. The UI
states the profile is only sent transiently per scoring request and never stored. (b) remains an
easy future gate if the tool ever becomes multi-user. Implementation note: scoring needs the JD
text, which the URL-import path never had client-side, so `/api/parse` now returns the source text
it parsed (`_source`) for the client to forward to `/api/score-fit`.

## Files touched

| File | Change |
|------|--------|
| `api/score-fit.js` *(new)* | New endpoint: hard-filter-aware, profile-personalized scoring call, own rate limiter |
| `src/lib/store.js` | Add `'Fit scoring'` to `ANALYSIS_TYPES`; `db.profile` shape documented (no code change beyond the existing spread) |
| `src/lib/db.jsx` | Add `setProfile(patch)` (shared with ATS spec if not already present) |
| `src/components/ProfileSetup.jsx` *(new)* | First-run wizard, skippable |
| `src/pages/Settings.jsx` (+ `.module.css`) | "Search Criteria" card — full profile, editable any time |
| `src/forms/ApplicationForm.jsx` | "Score this against my criteria" action after JD parse; renders verdict inline |
| `src/pages/Analysis.jsx` | Render `'Fit scoring'` entries (reasoning fields, verdict badge, cover-letter hook) |
| `src/components/RefineCriteria.jsx` *(new)* | Inline "Refine my criteria" input, attached to a Fit scoring entry; calls `setProfile()` |

## Verification

- **Hard-filter pre-check, no API call:** set `compFloor: 300000`, score a JD with a stated
  `$200k–$220k` range → instant `pass`, confirm via network tab that `/api/score-fit` was never
  called.
- **Soft scoring, full call:** clear `db.profile`, set only `softPreferences.productVsInfra` and
  `differentiators`, score a platform/infra-heavy JD → verdict reasoning should reference the
  product/infra tension explicitly, not just restate the JD.
- **Empty profile fallback:** `db.profile` fully unset → "Score this against my criteria" button
  either hides or shows a friendly "set up your criteria first" prompt linking to Settings; no
  broken call with an empty `profile: {}`.
- **Inline refinement loop:** trigger a verdict, use "Refine my criteria," confirm
  `db.profile.softPreferences.notes` has the new line and `updatedAt` is bumped; re-score the same
  app and confirm the new note is reflected in reasoning.
- **Portability:** Settings → Export JSON includes the full `profile` object including
  `hardFilters`/`softPreferences`; Import restores it intact; old export files without `profile`
  import cleanly (`db.profile` stays `undefined`, no crash).
- **Persistence as Analysis:** confirm a scored verdict appears in `Analysis.jsx` linked to the
  correct app/org, survives a page reload, and exports/imports with the rest of the data.

## Out of scope

Multi-profile support (e.g., scoring against two different target-role strategies at once) —
single profile per user for v1, consistent with VISION's single-player framing. Auto-detecting
hard filters from application history (e.g., inferring a comp floor from roles you've passed on) —
interesting later idea, explicit user input only for now. Confidence/calibration scoring (tracking
whether past verdicts matched real outcomes) — would need outcome data the tool doesn't currently
capture.

## Decisions (resolved at build)

1. **Shared key vs. BYO-key for `/api/score-fit`** — **shared key** (the owner's own
   `ANTHROPIC_API_KEY`, same as `/api/parse`). No BYO-key gating; keeps the feature friction-free.
2. **Wizard required or skippable?** — **fully skippable.** A dismissable Dashboard banner offers
   `ProfileSetup` (a Modal reusing the Settings fields via `SearchCriteria embedded`); the banner
   only appears once the user has started using the tool and never after dismissal.
3. **Tags vs. freeform** — **tags + an optional freeform "Qualifiers / exceptions" notes field**
   under hard filters for nuance the booleans can't capture.
4. **Auto-run vs. explicit button** — **auto-run** after each parse (changeable later if it burns
   too many tokens). Both Anthropic endpoints are rate-limited: per-IP hourly server backstop
   (`api/_ratelimit.js`, parse 20/hr, score-fit 30/hr) + per-browser daily caps in `store.js`
   (parse 15/day, score 25/day). Hard-filter pre-checks short-circuit scoring to zero cost.
