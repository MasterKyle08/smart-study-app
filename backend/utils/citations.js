function evidence(source, quote) {
  if (
    typeof quote !== "string" ||
    quote.trim().length < 12 ||
    quote.length > 500
  )
    return null;
  const escaped = quote
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(escaped, "i").exec(source);
  if (!match) return null;
  const markers = [
    ...source
      .slice(0, match.index)
      .matchAll(/\[Source: ([^\]\n]+?)(?: \| Page: (\d+))?\]/g),
  ];
  const marker = markers.at(-1);
  return {
    quote: match[0],
    start: match.index,
    end: match.index + match[0].length,
    file: marker?.[1] || null,
    page: marker?.[2] ? Number(marker[2]) : null,
  };
}
function attach(source, materials) {
  const citations = [];
  for (const [kind, items] of [
    ["flashcard", materials.flashcards || []],
    ["question", materials.quiz || []],
  ])
    for (const [index, item] of items.entries()) {
      const citation = evidence(
        source,
        item.sourceQuote || item.citation?.quote,
      );
      delete item.sourceQuote;
      delete item.citation;
      if (citation) {
        item.citation = citation;
        citations.push({ kind, index, ...citation });
      }
    }
  if (materials.summary) {
    const words = new Set(
      materials.summary.toLowerCase().match(/[a-z]{5,}/g) || [],
    );
    let best = null;
    for (const match of source.matchAll(/[^\n]{40,500}/g)) {
      const terms = new Set(match[0].toLowerCase().match(/[a-z]{5,}/g) || []);
      const score = [...terms].filter((word) => words.has(word)).length;
      if (score >= 3 && (!best || score > best.score))
        best = { score, quote: match[0] };
    }
    const citation = best && evidence(source, best.quote);
    if (citation)
      citations.push({ kind: "summary", related: true, ...citation });
  }
  return citations;
}
module.exports = { evidence, attach };
