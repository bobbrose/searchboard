// api/parse.js
//
// This is the ONLY place the Anthropic API key is used. It never reaches the browser.
// Scope is intentionally narrow: extract structured fields from a pasted job description.
// No open-ended chat, no arbitrary prompts from the client — keeps cost per-call small
// and bounded, and limits what a misuse attempt could even ask the model to do.

// --- very simple in-memory rate limiter ---------------------------------
// NOTE: Vercel serverless functions are stateless per-instance, so this is a
// best-effort backstop, not a hard guarantee — it resets on cold starts and
// isn't shared across regions/instances. It still meaningfully blunts bursty
// abuse from a single source within a warm instance. Combined with the
// client-side daily token check, this is enough for a friends-and-family
// scale tool. If usage grows, swap this for a real store (Upstash Redis is
// the standard low-effort upgrade on Vercel).
const requestLog = new Map(); // ip -> [timestamps]
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 20; // generous per-IP hourly ceiling

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > MAX_PER_WINDOW;
}

const SYSTEM_PROMPT = `You extract structured fields from job postings. Always respond with ONLY valid JSON, no markdown formatting, no explanation, no code fences. The JSON schema is exactly:
{
  "title": string,
  "org": string,
  "location": string,
  "fit_notes": string (2-3 sentences, neutral and factual, summarizing what the role involves and any notable requirements),
  "fit_score": number (1-5, a rough generic estimate of role seniority/scope, not a personal fit judgment since you don't know the applicant),
  "salary": string (the stated compensation or pay range, e.g. "$120k-150k" or "$265,000-279,500"; if multiple ranges are given, summarize concisely; empty string if not mentioned)
}
If a field can't be determined, use an empty string (or 3 for fit_score). Do not include any text outside the JSON object.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (isRateLimited(ip)) {
    res.status(429).json({
      error: 'Rate limit reached. Please try again later, or enter the role manually.'
    });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Missing job posting text.' });
    return;
  }

  // Hard cap input length — keeps cost bounded and prevents abuse via huge payloads.
  // 8000 chars covers long postings whose salary/comp section sits near the end.
  const trimmed = text.slice(0, 8000);

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
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: trimmed }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Anthropic API error:', apiRes.status, errText);
      res.status(502).json({ error: 'Parsing service unavailable. Please enter the role manually.' });
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
      res.status(502).json({ error: 'Could not parse response. Please enter the role manually.' });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error('Unhandled error in /api/parse:', err);
    res.status(500).json({ error: 'Something went wrong. Please enter the role manually.' });
  }
}
