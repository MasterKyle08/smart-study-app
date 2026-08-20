function usageDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function estimateTokens(text) {
  const chars = String(text || '').length;
  return Math.max(1, Math.ceil(chars / 4));
}

function userKeyFrom(user, ip) {
  if (user && user.id) return `user:${Number(user.id)}`;
  const raw = String(ip || 'unknown');
  return `anon:${raw.slice(0, 64)}`;
}

function parseGoogleUsageMetadata(meta, fallback = {}) {
  const data = meta || {};
  const input = Number(data.promptTokenCount || data.prompt_token_count || 0);
  const candidateOut = Number(data.candidatesTokenCount || data.candidates_token_count || 0);
  const thoughts = Number(data.thoughtsTokenCount || data.thoughts_token_count || 0);
  const total = Number(data.totalTokenCount || data.total_token_count || 0);
  if (input || candidateOut || thoughts || total) {
    const output = candidateOut + thoughts;
    return {
      inputTokens: input || Math.max(0, total - output),
      outputTokens: output || Math.max(0, total - input),
      source: 'api',
    };
  }
  return {
    inputTokens: Number(fallback.inputTokens) || 0,
    outputTokens: Number(fallback.outputTokens) || 0,
    source: 'estimate',
  };
}

module.exports = { usageDate, estimateTokens, userKeyFrom, parseGoogleUsageMetadata };
