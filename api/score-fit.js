// api/score-fit.js
//
// Personalized fit scoring — deliberately separate from /api/parse, whose scope
// is "extract generic fields, no personal judgment." This one is the opposite:
// it takes the user's criteria profile and a JD and returns a personal verdict.
// Its own rate-limit bucket and system prompt; same shared Anthropic key.
//
// Hard filters are checked client-side BEFORE this is ever called (a role that
// trips one never reaches here — see VISION principle #6), so this endpoint is
// reserved for the judgment calls a boolean can't make. The profile's hard
// filters are still passed as context so the model can reason about borderline
// cases the client heuristics let through.

import { isRateLimited, clientIp } from './_ratelimit.js';
import { logUsage } from './_usage.js';

const MAX_PER_HOUR = 30; // higher than parse: scoring auto-runs per parse + re-scores

const SYSTEM_PROMPT = `You measure how closely a single job posting matches the reader's stated criteria, and recommend an action. The reader is the candidate; address them directly in the second person ("you", "your"). Respond with ONLY valid JSON — no markdown, no code fences, no prose outside the object. The schema is exactly:
{
  "fit": "miss" | "partial" | "close",
  "action": "apply" | "wait" | "pass",
  "reasoning": {
    "roleFit": string,
    "domainFit": string,
    "comp": string,
    "stackAlignment": string,
    "redFlags": string
  },
  "coverLetterHook": string
}

PRIVACY — these verdicts are meant to be shareable. Never write the candidate's name or any personally identifying detail (name, email, phone, employer names from their background) anywhere in the output. Always say "you"/"your", never a name or "the candidate". Even if a name appears in the criteria or differentiators, do not echo it.

"fit" measures ONLY how closely the role matches your stated criteria and background. It is NOT a judgment of your ability or of the role's quality — only the degree of GENUINE overlap with what you want and what you've done. Be calibrated and skeptical, not charitable: most roles a person encounters are "partial" or "miss". Reserve "close" for genuine matches.
- "close": strong alignment on the things that matter most — role function/track, level, and domain — with no fundamental mismatch, and your hard criteria satisfied.
- "partial": real overlap on some dimensions but a clear gap or mismatch on others; genuinely mixed.
- "miss": a fundamental mismatch on role function/track (e.g. people-management vs. individual-contributor/tech-lead), on industry/domain, or on level — OR it conflicts with a stated criterion. A miss may note any superficial overlap, but surface overlap does NOT lift a fundamental mismatch up to "partial".

Judging rules — apply these strictly:
- Do NOT give partial credit for superficial keyword overlap (a shared buzzword like "AI", or a shared programming language or tool). Judge the substance: is this the same KIND of role, in a domain you target or have worked in, at your level?
- Distinguish people-management from individual-contributor or tech-lead work. "Led a team" in a background is often a tech-lead/IC role; if a role requires years of people-management and your background is individual-contributor (or vice versa), treat that as a function mismatch — do not assume equivalence.
- Weight industry/domain heavily. A role in an industry absent from your background and not among your targets (e.g. a healthcare/pharmacy role for a consumer-software background) is a major gap, not a minor one.
- When torn between "miss" and "partial", choose "miss" if there is a fundamental mismatch in function/track, domain, or level.

"action" is the recommendation for what you should do. It is informed by fit but can diverge from it because of other factors:
- A materially better-than-required opportunity (e.g. comp well above your floor, an exceptional scope/title jump) can warrant "apply" even on a "partial" fit.
- Serious red flags, or a stated deal-breaker, can warrant "wait" or "pass" even on a "close" fit.
- "apply" = worth a serious application now; "wait" = promising but hold for more info or better timing; "pass" = not worth pursuing.
- A "miss" fit is almost always "pass" unless something exceptional overrides it.
When action diverges from fit, say why in the relevant reasoning field.

Work through this five-stage framework, letting earlier stages weigh most:
1. Role & level — is this the same KIND of role (individual-contributor vs. people-management, and the function) at your level and on your track? Weigh this most; a mismatch here caps fit at "partial" or below.
2. Domain fit — does the industry/product domain and company attributes align with your targets or background, and avoid your exclusions?
3. Comp — does stated compensation clear your floor, and by how much? If comp isn't stated, say so; don't assume.
4. Stack/skills alignment — how well do the required skills and scope match your background and preferences?
5. Red-flag check — scan the JD language for your stated red-flag patterns and obvious misrepresentations (e.g. a senior title with contradictory day-to-day expectations).

Each reasoning field is AT MOST 2 sentences — tight, plain, and factual, like a trusted recruiter's honest read. Reference your actual criteria; don't restate the JD. If the profile lacks data for a stage, say what's missing in a few words rather than inventing a judgment.

coverLetterHook: one or two sentences you could adapt as an opening hook, drawing on your differentiators where they connect to this role. Empty string if action is "pass".`;

// Turn the profile into a compact, labeled block for the user message. Only
// fields that carry signal; skip empties to keep the payload (and cost) small.
function profileToText(p = {}) {
  const hard = p.hardFilters || {};
  const soft = p.softPreferences || {};
  const lines = [];
  const list = arr => (arr || []).filter(Boolean).join('; ');

  if (p.targetTitles?.length) lines.push(`Target titles: ${list(p.targetTitles)}`);
  if (p.homeState) lines.push(`Home location: ${p.homeState}`);
  if (hard.compFloor != null) lines.push(`Comp floor (USD base): ${hard.compFloor}`);
  const IC_CODING = {
    none: 'wants pure leadership, no hands-on IC coding',
    'hands-on': 'wants some hands-on IC coding',
    mostly: 'wants a primarily/mostly hands-on coding role'
  };
  if (hard.icCoding && IC_CODING[hard.icCoding])
    lines.push(`Hands-on coding: ${IC_CODING[hard.icCoding]}`);
  if (hard.domainExclusions?.length)
    lines.push(`Excluded domains: ${list(hard.domainExclusions)}`);
  if (hard.remoteRequired) lines.push('Remote required: yes');
  if (hard.relocationExceptions?.length)
    lines.push(`In-person acceptable in: ${list(hard.relocationExceptions)}`);
  if (hard.notes) lines.push(`Hard-filter qualifiers: ${hard.notes}`);
  const PRODUCT_INFRA = {
    product: 'prefers product-focused work',
    balanced: 'prefers a balanced / full-stack role',
    infra: 'prefers infrastructure-focused work'
  };
  if (soft.productVsInfra && PRODUCT_INFRA[soft.productVsInfra])
    lines.push(`Product vs. infra: ${PRODUCT_INFRA[soft.productVsInfra]}`);
  if (soft.companyAttributes?.length)
    lines.push(`Preferred company attributes: ${list(soft.companyAttributes)}`);
  if (soft.notes) lines.push(`Other preferences: ${soft.notes}`);
  if (p.differentiators?.length)
    lines.push(`Differentiators: ${list(p.differentiators)}`);
  if (p.redFlagPatterns?.length)
    lines.push(`Red-flag patterns to watch: ${list(p.redFlagPatterns)}`);

  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = clientIp(req);
  if (isRateLimited('score-fit', ip, MAX_PER_HOUR)) {
    res.status(429).json({
      error: 'Scoring rate limit reached. Please try again later.'
    });
    return;
  }

  const { jdText, profile } = req.body || {};
  if (!jdText || typeof jdText !== 'string') {
    res.status(400).json({ error: 'Missing job posting text to score.' });
    return;
  }

  const profileText = profileToText(profile);
  if (!profileText) {
    res.status(400).json({
      error: 'No criteria to score against. Set up your Fit Criteria first.'
    });
    return;
  }

  const userMessage = `CANDIDATE CRITERIA:\n${profileText}\n\nJOB POSTING:\n${jdText.slice(0, 8000)}`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error:', apiRes.status, errText);
      res.status(502).json({ error: 'Scoring service unavailable. Try again later.' });
      return;
    }

    const data = await apiRes.json();
    const raw = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      res.status(502).json({ error: 'Could not parse the scoring response. Try again.' });
      return;
    }

    const _usage = logUsage('score-fit', data);
    res.status(200).json({ ...parsed, _usage });
  } catch (err) {
    console.error('Unhandled error in /api/score-fit:', err);
    res.status(500).json({ error: 'Something went wrong while scoring.' });
  }
}
