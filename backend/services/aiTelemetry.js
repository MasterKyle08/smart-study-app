const { db } = require("../models/db");
let pending = 0;
function record(value) {
  if (process.env.LOCAL_DEVELOPMENT === "1" || pending >= 100) return;
  pending++;
  const outcome =
    value.outcome ||
    (value.status === "timeout"
      ? "timeout"
      : Number(value.status) >= 400
        ? "provider-error"
        : value.finishReason === "MAX_TOKENS"
          ? "truncated"
          : "success");
  db.execute({
    sql: "INSERT INTO AiRequestEvents(model,outcome,status,elapsed_ms,queue_ms,provider_ms,input_tokens) VALUES (?,?,?,?,?,?,?)",
    args: [
      String(value.model || "application").slice(0, 100),
      outcome,
      String(value.status || "").slice(0, 20),
      Number(value.elapsedMs) || 0,
      Number(value.queueMs) || 0,
      Number(value.providerMs) || 0,
      Number(value.inputTokens) || 0,
    ],
  })
    .catch(() => {})
    .finally(() => pending--);
}
async function dashboard() {
  if(require('./localState').local()) {
    const exists=await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='AiRequestEvents'");
    if(!exists.rows.length)return {days:7,groups:[],daily:[],providerAttempts:0,providerResponseSuccessPercent:null,note:'Reliability collection starts after the production schema update. Manual local development does not record attempts.'};
  }
  const groups = (
    await db.execute(
      "SELECT model,outcome,status,COUNT(*) AS count,ROUND(AVG(elapsed_ms)) AS average_ms,ROUND(AVG(queue_ms)) AS queue_ms,ROUND(AVG(provider_ms)) AS provider_ms FROM AiRequestEvents WHERE created_at>=datetime('now','-7 days') GROUP BY model,outcome,status ORDER BY model,outcome,status",
    )
  ).rows;
  const daily = (
    await db.execute(
      "SELECT date(created_at) AS day,outcome,COUNT(*) AS count FROM AiRequestEvents WHERE created_at>=datetime('now','-7 days') GROUP BY day,outcome ORDER BY day DESC",
    )
  ).rows;
  const provider = groups.filter((row) =>
    [
      "success",
      "truncated",
      "provider-error",
      "timeout",
      "network-error",
    ].includes(row.outcome),
  );
  const attempts = provider.reduce((sum, row) => sum + Number(row.count), 0);
  const responses = provider
    .filter((row) => ["success", "truncated"].includes(row.outcome))
    .reduce((sum, row) => sum + Number(row.count), 0);
  return {
    days: 7,
    groups,
    daily,
    providerAttempts: attempts,
    providerResponseSuccessPercent: attempts
      ? Math.round((responses / attempts) * 1000) / 10
      : null,
    note: "Response success counts HTTP-success responses, including truncated output, across dispatched attempts and retries. Invalid output is reported separately and can fail an application task even after HTTP 200. Admission failures never reached Google. No prompts, answers or user identities are recorded.",
  };
}
module.exports = { record, dashboard };
