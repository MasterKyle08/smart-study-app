function normalizeEmail(value) {
  if (typeof value !== 'string') throw Object.assign(new Error('Enter a valid email address.'), { statusCode: 400 });
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Enter a valid email address.'), { statusCode: 400 });
  }
  return email;
}

function reservedEmail(email) {
  return [process.env.ADMIN_EMAIL, process.env.ADMIN_OWNER_EMAILS, process.env.PREMIUM_USER_EMAILS]
    .flatMap(value => String(value || '').split(','))
    .some(value => value.trim().toLowerCase() === email);
}

module.exports = { normalizeEmail, reservedEmail };
