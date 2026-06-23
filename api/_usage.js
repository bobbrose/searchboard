// api/_usage.js
//
// Logs token usage from an Anthropic Messages response (visible in the Vercel
// function logs) and returns a compact { input_tokens, output_tokens } the
// client can tally. The Anthropic Console remains the authoritative source for
// real spend across all users of the shared key — this is per-call attribution.
export function logUsage(endpoint, data) {
  const u = data?.usage || {};
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  console.log(
    `[usage] ${endpoint} model=${data?.model || '?'} input=${input} output=${output} cache_read=${cacheRead}`
  );
  return { input_tokens: input, output_tokens: output };
}
