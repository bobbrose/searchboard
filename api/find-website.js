// api/find-website.js
//
// Best-effort lookup of a company's official homepage URL from its name, used
// to auto-fill the Org "Website" field. Same shared Anthropic key and stateless
// per-IP limiter as the other endpoints, with its own bucket. Deliberately
// conservative: the model is told to return an empty string rather than guess a
// plausible-but-wrong domain, and we drop any URL whose host doesn't resolve so
// we never persist a dead link.

import { isRateLimited, clientIp } from './_ratelimit.js';
import { logUsage } from './_usage.js';
import { normalizeWebsite, resolves } from './_url.js';

const MAX_PER_HOUR = 400; // cheap lookups; high ceiling for one-shot backfills

const SYSTEM_PROMPT = `You return the official website homepage URL for a company, given its name (and optional industry/location to disambiguate). Respond with ONLY valid JSON, no markdown, no prose:
{ "website": string }
Rules:
- Return the company's primary official homepage as scheme + root domain, no path (e.g. "https://stripe.com").
- Only return a URL you are reasonably confident is the company's real official site. If you are not sure of the exact domain, return an empty string. Do NOT guess a plausible-looking domain.
- Never return social media, LinkedIn, Crunchbase, Wikipedia, job boards, or aggregator pages.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = clientIp(req);
  if (isRateLimited('find-website', ip, MAX_PER_HOUR)) {
    res.status(429).json({ error: 'Rate limit reached. Try again later.' });
    return;
  }

  const { name, industry, location } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Missing company name.' });
    return;
  }

  const context = [
    `Company: ${name.trim().slice(0, 200)}`,
    typeof industry === 'string' && industry.trim()
      ? `Industry: ${industry.trim().slice(0, 100)}`
      : '',
    typeof location === 'string' && location.trim()
      ? `Location: ${location.trim().slice(0, 100)}`
      : ''
  ]
    .filter(Boolean)
    .join('\n');

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
        max_tokens: 100,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: context }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error:', apiRes.status, errText);
      res.status(502).json({ error: 'Lookup service unavailable.' });
      return;
    }

    const data = await apiRes.json();
    const raw = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    let candidate = '';
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      candidate = typeof parsed.website === 'string' ? parsed.website.trim() : '';
    } catch {
      candidate = '';
    }

    // Normalize the model's candidate to an http(s) origin, then verify it
    // resolves. `_candidate` is returned even when unverified so the client can
    // log *why* nothing was filled: no candidate vs. a domain that didn't load.
    let website = '';
    if (candidate) {
      const norm = normalizeWebsite(candidate);
      if (norm && (await resolves(norm))) website = norm;
    }

    const _usage = logUsage('find-website', data);
    res.status(200).json({ website, _candidate: candidate, _usage });
  } catch (err) {
    console.error('Unhandled error in /api/find-website:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
