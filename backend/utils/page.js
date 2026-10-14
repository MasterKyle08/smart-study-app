function page(query = {}) {
  const limit = Math.min(
    50,
    Math.max(1, Math.floor(Number(query.limit) || 24)),
  );
  const before = query.before == null ? null : Number(query.before);
  if (before !== null && (!Number.isSafeInteger(before) || before < 1))
    throw Object.assign(new Error("Invalid page cursor."), { statusCode: 400 });
  return { limit, before };
}
function offset(value = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 100000)
    throw Object.assign(new Error("Invalid page offset."), { statusCode: 400 });
  return number;
}
function metadata(body) {
  if (
    typeof body.folder !== "string" ||
    body.folder.length > 80 ||
    !Array.isArray(body.tags) ||
    body.tags.length > 10 ||
    body.tags.some((tag) => typeof tag !== "string" || tag.length > 50)
  )
    throw Object.assign(
      new Error("Use a folder up to 80 characters and at most 10 short tags."),
      { statusCode: 400 },
    );
  return {
    folder: body.folder.trim(),
    tags: [...new Set(body.tags.map((tag) => tag.trim()).filter(Boolean))],
  };
}
module.exports = { page, offset, metadata };
