function selectSource(value, limit = 14000) {
  const raw = String(value || '').trim();
  if (raw.length <= limit) return { text: raw, warning: null };
  const size = Math.floor((limit - 300) / 3);
  const starts = [0, Math.floor((raw.length - size) / 2), raw.length - size];
  const excerpts = starts.map((start, index) => {
    const end = Math.min(raw.length, start + size);
    return `[Excerpt ${index + 1}, characters ${start + 1}-${end} of ${raw.length}]\n${raw.slice(start, end)}`;
  });
  return {
    text: excerpts.join('\n\n'),
    warning: `This document exceeds the ${limit.toLocaleString()}-character generation limit. Excerpts from its beginning, middle, and end were used; some content is omitted. Split it into smaller uploads for complete coverage.`,
  };
}
module.exports = { selectSource };
