// api/parse.js
//
// This is the ONLY place the Anthropic API key is used. It never reaches the browser.
// Scope is intentionally narrow: extract structured fields from a pasted job description.
// No open-ended chat, no arbitrary prompts from the client — keeps cost per-call small
// and bounded, and limits what a misuse attempt could even ask the model to do.
//
// Two ways in, same extraction: the client sends either { text } (a pasted JD)
// or { url } (a job-posting URL). For a URL we NEVER fetch the user's URL — we
// resolve it to a trusted ATS API host via the allowlist in _ats.js, fetch
// that, and feed the resulting text through the identical extraction call. See
// api/_ats.js for the SSRF-by-construction design.

import { resolveAtsUrl, atsPayloadToText } from './_ats.js';

import { isRateLimited, clientIp } from './_ratelimit.js';
import { logUsage } from './_usage.js';

const MAX_PER_HOUR = 20; // generous per-IP hourly ceiling for extraction

const SYSTEM_PROMPT = `You extract structured fields from job postings. Always respond with ONLY valid JSON, no markdown formatting, no explanation, no code fences. The JSON schema is exactly:
{
  "title": string,
  "org": string,
  "location": string,
  "fit_notes": string (2-3 sentences, neutral and factual, summarizing what the role involves and any notable requirements),
  "fit_score": number (1-5, a rough generic estimate of role seniority/scope, not a personal fit judgment since you don't know the applicant),
  "salary": string (the stated compensation or pay range, e.g. "$120k-150k" or "$265,000-279,500"; if multiple ranges are given, summarize concisely; empty string if not mentioned),
  "fit_digest": string (a compact plain-text condensation of ONLY the parts of the posting that matter for assessing fit: core responsibilities, required and preferred qualifications, seniority/level and reporting structure, team and scope, tech stack and tools, industry/product domain, compensation figures, and work arrangement (remote/hybrid/onsite). Keep any unusual, contradictory, or concerning phrasing close to verbatim. OMIT boilerplate: benefits/perks lists, EEO/legal statements, company marketing, and application instructions. Stay under ~1200 characters. This is neutral extraction, NOT a fit judgment.)
}
If a field can't be determined, use an empty string (or 3 for fit_score). Do not include any text outside the JSON object.`;

// Appended only when the client supplies a home state. Lets the model pick the
// region-specific pay band instead of summarizing "varies by state".
const STATE_SALARY_RULE = `\nFor "salary": if the posting lists location- or state-specific pay ranges and a user state is provided below, return the single range that matches that state. Otherwise summarize the range(s) concisely.`;

const ATS_TIMEOUT_MS = 5000;

// Resolve { url } to plain JD text via the ATS allowlist. Throws an Error whose
// .status is the HTTP code to return: 400 for an unsupported URL (no fetch
// happens), 502 for an ATS that's unreachable or returns junk.
async function fetchAtsText(url) {
  const resolved = resolveAtsUrl(url);
  if (!resolved) {
    const err = new Error(
      "That URL isn't from a supported job board (Greenhouse, Lever). Paste the description instead."
    );
    err.status = 400;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATS_TIMEOUT_MS);
  let data;
  try {
    const atsRes = await fetch(resolved.apiUrl, { signal: controller.signal });
    if (!atsRes.ok) {
      throw new Error(`ATS responded ${atsRes.status}`);
    }
    data = await atsRes.json();
  } catch (e) {
    console.error('ATS fetch failed:', resolved.apiUrl, e?.message);
    const err = new Error(
      "Couldn't read that job posting. Paste the description instead."
    );
    err.status = 502;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const text = atsPayloadToText(resolved.provider, data, resolved.jobId);
  if (!text) {
    const err = new Error(
      "That posting didn't contain a description we could read. Paste it instead."
    );
    err.status = 502;
    throw err;
  }
  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = clientIp(req);

  if (isRateLimited('parse', ip, MAX_PER_HOUR)) {
    res.status(429).json({
      error: 'Rate limit reached. Please try again later, or enter the role manually.'
    });
    return;
  }

  const { text, url, userState } = req.body || {};

  // Resolve the JD text from either a pasted body or an ATS URL. The URL path
  // can fail before we ever call Anthropic (unsupported URL = no fetch).
  let source;
  if (typeof url === 'string' && url.trim()) {
    try {
      source = await fetchAtsText(url.trim());
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
      return;
    }
  } else if (typeof text === 'string' && text.trim()) {
    source = text;
  } else {
    res.status(400).json({ error: 'Provide a job posting URL or pasted text.' });
    return;
  }

  // Hard cap input length — keeps cost bounded and prevents abuse via huge payloads.
  // 8000 chars covers long postings whose salary/comp section sits near the end.
  const trimmed = source.slice(0, 8000);

  // Only a short state string ever leaves the browser, transiently, alongside
  // the JD — consistent with the existing transient-text model.
  const state =
    typeof userState === 'string' && userState.trim()
      ? userState.trim().slice(0, 40)
      : '';
  const system = state ? SYSTEM_PROMPT + STATE_SALARY_RULE : SYSTEM_PROMPT;
  const userMessage = state ? `User home location: ${state}\n\n${trimmed}` : trimmed;

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
        max_tokens: 1000, // headroom for the fit_digest field (~1200 chars)
        system,
        messages: [{ role: 'user', content: userMessage }]
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

    // `_digest` is a compact, fit-relevant condensation of the posting — what
    // the client persists and scores against (cheap to store, reproducible
    // across sessions). `_source` is the full parsed text, returned so the
    // client has the JD this session (notably the URL-import path, where it
    // never had the text) and as a fallback if the digest comes back empty.
    // Both are transient and ignored by field mappers; the JD is public either
    // way. `_usage` lets the client tally tokens (also logged server-side).
    const _digest = typeof parsed.fit_digest === 'string' ? parsed.fit_digest : '';
    delete parsed.fit_digest;
    const _usage = logUsage('parse', data);
    res.status(200).json({ ...parsed, _source: trimmed, _digest, _usage });
  } catch (err) {
    console.error('Unhandled error in /api/parse:', err);
    res.status(500).json({ error: 'Something went wrong. Please enter the role manually.' });
  }
}
