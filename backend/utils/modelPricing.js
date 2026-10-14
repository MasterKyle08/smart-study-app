// Standard text pricing per million tokens; verified against Google's price list.
const PRICES = {
  "gemini-2.5-flash-lite": [0.1, 0.4],
  "gemini-2.5-flash": [0.3, 2.5],
  "gemini-3.5-flash-lite": [0.3, 2.5],
};
function pricing(
  model = process.env.GOOGLE_PREMIUM_MODEL_NAME || "gemini-2.5-flash-lite",
) {
  const value = PRICES[model];
  const input = Number(process.env.PREMIUM_INPUT_USD_PER_MILLION ?? value?.[0]);
  const output = Number(
    process.env.PREMIUM_OUTPUT_USD_PER_MILLION ?? value?.[1],
  );
  if (
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    input < 0 ||
    output < 0
  )
    throw Object.assign(
      new Error(
        "Configure verified input/output prices for the selected Premium model.",
      ),
      { statusCode: 503 },
    );
  return {
    model,
    input,
    output,
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    verified: "2026-10-14",
  };
}
module.exports = { pricing };
