const { db } = require('../models/db');

let writes = Promise.resolve();

function writeTransaction(fn) {
  const operation = writes.then(() => executeWrite(fn));
  writes = operation.catch(() => {});
  return operation;
}

async function executeWrite(fn) {
  const tx = await db.transaction('write');
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
