// api/parse-resume.js
//
// Seed a Fit Criteria profile from pasted résumé text. A résumé describes who
// the candidate has BEEN, not what they want next — so we extract only the
// fields a résumé can honestly support (titles, accomplishments, location, a
// background summary) and leave the forward-looking preferences (comp floor,
// deal-breakers, company type) for the user to set. Same shared key + transient
// model as the other endpoints; its own rate-limit bucket.

import { isRateLimited, clientIp } from './_ratelimit.js';

const MAX_PER_HOUR = 30; // résumé seeding is a once-in-a-while action

const SYSTEM_PROMPT = `You extract a job-search starting point from a résumé. Respond with ONLY valid JSON — no markdown, no code fences, no prose outside the object. The schema is exactly:
{
  "targetTitles": string[],
  "differentiators": string[],
  "homeState": string,
  "background": string
}

Rules:
- "targetTitles": 1-3 role titles this person is plausibly targeting next, based on their most recent/senior roles. Use the role's level or the natural next step (e.g. a Senior Engineering Manager might target "Senior Engineering Manager" and "Director of Engineering"). Do NOT invent domains they have no background in.
- "differentiators": 3-6 short, concrete bullets capturing their strongest selling points — scope, scale, outcomes, notable skills. Each a brief phrase, not a full sentence. These double as cover-letter hook material, so keep them sharp and specific (numbers where the résumé gives them).
- "homeState": their location if stated (a US state abbreviation, or city/region as written). Empty string if not present.
- "background": 2-4 plain sentences giving the scorer concrete anchors to judge fit against. Explicitly state: (a) their primary FUNCTION/track and whether they are an individual-contributor / tech-lead or a people-manager (and roughly how many years in each); (b) the industries/domains they've actually worked in; (c) their level/seniority; (d) core skills and tech stack. Be precise about IC-vs-management — "led a team" as a tech lead is not the same as people-management; say which it is.
- Extract only what the résumé supports. Use empty string / empty array where the résumé is silent. Never fabricate compensation, preferences, or deal-breakers — those aren't on a résumé.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = clientIp(req);
  if (isRateLimited('resume', ip, MAX_PER_HOUR)) {
    res.status(429).json({ error: 'Rate limit reached. Please try again later.' });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Paste your résumé text first.' });
    return;
  }

  // Cap input — résumés are short; this bounds cost and abuse.
  const trimmed = text.slice(0, 12000);

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
        messages: [{ role: 'user', content: trimmed }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error:', apiRes.status, errText);
      res.status(502).json({ error: 'Résumé parsing unavailable. Enter your criteria manually.' });
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
      res.status(502).json({ error: 'Could not read that résumé. Enter your criteria manually.' });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error('Unhandled error in /api/parse-resume:', err);
    res.status(500).json({ error: 'Something went wrong reading the résumé.' });
  }
}
