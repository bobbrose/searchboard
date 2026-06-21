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

const MAX_PER_HOUR = 30; // higher than parse: scoring auto-runs per parse + re-scores

const SYSTEM_PROMPT = `You evaluate a single job posting against a specific candidate's criteria profile and return a personalized fit verdict. Respond with ONLY valid JSON — no markdown, no code fences, no prose outside the object. The schema is exactly:
{
  "verdict": "pass" | "conditional" | "apply",
  "priority": "low" | "medium" | "medium-high" | "high",
  "reasoning": {
    "peopleLeadership": string,
    "domainFit": string,
    "comp": string,
    "stackAlignment": string,
    "redFlags": string
  },
  "coverLetterHook": string
}

Apply this five-stage framework in order, and let earlier stages dominate the verdict:
1. People-leadership primacy — does the role match the candidate's desired leadership-vs-IC balance? This matters most.
2. Domain fit — does the company/product domain align with their targets and avoid their exclusions?
3. Comp — does stated compensation clear their floor? If comp isn't stated, say so; don't assume.
4. Stack alignment — how well does the tech/scope match their background and preferences?
5. Red-flag check — scan the JD language for the candidate's stated red-flag patterns and any obvious misrepresentations (e.g. an "EM/Director" title with heavy hands-on IC coding expectations).

Each reasoning field is 2-3 sentences, plain and factual, in the same neutral tone as a recruiter's honest read — reference the candidate's actual criteria, don't just restate the JD. If the profile lacks data for a stage, say what's missing rather than inventing a judgment.

verdict: "apply" = strong match worth a serious application; "conditional" = worth it only if specific concerns check out; "pass" = not a fit.
priority: how urgently this deserves the candidate's limited application energy.
coverLetterHook: one or two sentences the candidate could adapt as an opening hook, drawing on their differentiators where they connect to this role. Empty string if verdict is "pass".`;

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
  if (hard.maxIcCodingPercent != null)
    lines.push(`Max acceptable IC-coding %: ${hard.maxIcCodingPercent}`);
  if (hard.domainExclusions?.length)
    lines.push(`Excluded domains: ${list(hard.domainExclusions)}`);
  if (hard.remoteRequired) lines.push('Remote required: yes');
  if (hard.relocationExceptions?.length)
    lines.push(`In-person acceptable in: ${list(hard.relocationExceptions)}`);
  if (hard.notes) lines.push(`Hard-filter qualifiers: ${hard.notes}`);
  if (soft.productVsInfra) lines.push(`Product vs. infra: ${soft.productVsInfra}`);
  if (soft.companyType) lines.push(`Preferred company type: ${soft.companyType}`);
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
      error: 'No criteria to score against. Set up your Search Criteria first.'
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
        max_tokens: 900,
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

    res.status(200).json(parsed);
  } catch (err) {
    console.error('Unhandled error in /api/score-fit:', err);
    res.status(500).json({ error: 'Something went wrong while scoring.' });
  }
}
