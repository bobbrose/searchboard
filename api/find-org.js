// api/find-org.js
//
// Infer the hiring company (and its official website) for a job posting from
// whatever details a job record carries — title, posting URL, location, notes,
// and the fit digest. Used to backfill the Organization on jobs that have none.
// Same shared key and per-IP limiter as the other endpoints; its own bucket.
// Conservative by design: the model returns empty strings rather than guess,
// and any website is normalized + reachability-checked before we return it.

import { isRateLimited, clientIp } from './_ratelimit.js';
import { logUsage } from './_usage.js';
import { normalizeWebsite, resolves } from './_url.js';

const MAX_PER_HOUR = 400; // cheap lookups; high ceiling for one-shot backfills

const SYSTEM_PROMPT = `You identify the hiring company for a job posting from the details provided, plus that company's official website. Respond with ONLY valid JSON, no markdown, no prose:
{ "company": string, "website": string }
Rules:
- "company" is the organization doing the hiring (NOT a staffing agency, recruiter, or job board), written as the company name would normally appear.
- "website" is that company's official homepage: scheme + root domain, no path (e.g. "https://stripe.com").
- Only fill a field you are reasonably confident about. If the details don't make the company clear, return empty strings for BOTH fields. Do NOT guess a plausible-looking company or domain.
- Never return social media, LinkedIn, Crunchbase, Wikipedia, job boards, or aggregators as the website.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = clientIp(req);
  if (isRateLimited('find-org', ip, MAX_PER_HOUR)) {
    res.status(429).json({ error: 'Rate limit reached. Try again later.' });
    return;
  }

  const { title, link, location, notes, digest } = req.body || {};
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const context = [
    str(title, 200) && `Job title: ${str(title, 200)}`,
    str(link, 300) && `Posting URL: ${str(link, 300)}`,
    str(location, 100) && `Location: ${str(location, 100)}`,
    str(notes, 800) && `Notes: ${str(notes, 800)}`,
    str(digest, 1500) && `Posting summary: ${str(digest, 1500)}`
  ]
    .filter(Boolean)
    .join('\n');

  if (!context) {
    res.status(400).json({ error: 'No job details to identify a company from.' });
    return;
  }

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
        max_tokens: 120,
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

    let company = '';
    let website = '';
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      company = typeof parsed.company === 'string' ? parsed.company.trim() : '';
      website = typeof parsed.website === 'string' ? parsed.website.trim() : '';
    } catch {
      company = '';
      website = '';
    }

    if (website) {
      website = normalizeWebsite(website);
      if (website && !(await resolves(website))) website = '';
    }

    const _usage = logUsage('find-org', data);
    res.status(200).json({ company, website, _usage });
  } catch (err) {
    console.error('Unhandled error in /api/find-org:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
