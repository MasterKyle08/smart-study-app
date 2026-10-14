const crypto = require("node:crypto");
async function withLock(client, key, fn) {
  const owner = crypto.randomUUID();
  const now = Date.now();
  const result = await client.execute({
    sql: "INSERT INTO BillingLocks(resource,owner,expires_at) VALUES (?,?,?) ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE BillingLocks.expires_at<? RETURNING owner",
    args: [key, owner, now + 90000, now],
  });
  if (!result.rows.length)
    throw Object.assign(
      new Error("Billing synchronization is in progress. Try again shortly."),
      { statusCode: 503 },
    );
  try {
    return await fn(async (tx) => {
      const valid = await tx.execute({
        sql: "SELECT owner FROM BillingLocks WHERE resource=? AND owner=? AND expires_at>?",
        args: [key, owner, Date.now()],
      });
      if (!valid.rows.length)
        throw Object.assign(
          new Error("Billing lock expired. Retry synchronization."),
          { statusCode: 503 },
        );
    });
  } finally {
    await client.execute({
      sql: "DELETE FROM BillingLocks WHERE resource=? AND owner=?",
      args: [key, owner],
    });
  }
}
module.exports = { withLock };
