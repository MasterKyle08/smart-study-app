// Explicit server operator action; never invoked by web registration/startup.
const { configureRuntime } = require('../config/environment');
if (process.env.NODE_ENV !== 'production') throw new Error('Run this explicitly inside the production container; see SECURITY-UPGRADE.md.');
configureRuntime();
const bcrypt = require('bcryptjs');
const { normalizeEmail } = require('../utils/identity');
const { writeTransaction } = require('../utils/transaction');
const { close } = require('../models/db');

(async () => {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  let password = '';
  for await (const chunk of process.stdin) {
    password += chunk;
    if (Buffer.byteLength(password) > 256) throw new Error('Password input is too long.');
  }
  password = password.replace(/\r?\n$/, '');
  if (password.length < 6 || Buffer.byteLength(password) > 72) throw new Error('Supply the current account password, or a new owner passphrase of at least 12 characters and at most 72 bytes.');
  const hash = await bcrypt.hash(password, 12);
  await writeTransaction(async tx => {
    const found = await tx.execute({ sql: 'SELECT id, password_hash FROM Users WHERE LOWER(TRIM(email)) = ?', args: [email] });
    if (found.rows.length) {
      if (!await bcrypt.compare(password, found.rows[0].password_hash)) throw new Error('For an existing account, supply its current password. No password was reset.');
      await tx.execute({ sql: "UPDATE Users SET role = 'admin', is_owner = 1 WHERE id = ?", args: [found.rows[0].id] });
    } else {
      if (password.length < 12) throw new Error('New owner accounts require a passphrase of at least 12 characters.');
      await tx.execute({ sql: "INSERT INTO Users (email, password_hash, role, is_owner) VALUES (?, ?, 'admin', 1)", args: [email, hash] });
    }
  });
  console.log('Owner account is configured. No password or token was printed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(close);
