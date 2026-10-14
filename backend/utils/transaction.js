const { db } = require("../models/db");

const writes = new WeakMap();

function writeTransaction(fn, client = db) {
  const operation = (writes.get(client) || Promise.resolve()).then(() =>
    executeWrite(fn, client),
  );
  writes.set(
    client,
    operation.catch(() => {}),
  );
  return operation;
}

async function executeWrite(fn, client) {
  const tx = await client.transaction("write");
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  } finally {
    tx.close();
  }
}

module.exports = { writeTransaction };
