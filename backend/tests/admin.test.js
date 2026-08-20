const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isOwnerEmail,
  isAdminUser,
  normalizePhone,
  isValidE164,
  maskPhone,
  canChangeAdminRole,
  canDeleteUser,
  canBanUser,
  gcpRequestCountFilter,
} = require('../utils/adminRules');
const otp = require('../utils/otpCrypto');

test('owner email is treated as admin', () => {
  const prev = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = 'owner@example.com';
  assert.equal(isOwnerEmail('owner@example.com'), true);
  assert.equal(isOwnerEmail('OWNER@example.com'), true);
  assert.equal(isOwnerEmail('other@example.com'), false);
  assert.equal(isAdminUser({ email: 'owner@example.com', role: 'user' }), true);
  assert.equal(isAdminUser({ email: 'staff@example.com', role: 'admin' }), true);
  assert.equal(isAdminUser({ email: 'staff@example.com', role: 'user' }), false);
  process.env.ADMIN_EMAIL = prev;
});

test('phone normalization and masking', () => {
  assert.equal(normalizePhone('(555) 123-4567'), '+15551234567');
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
  assert.equal(isValidE164('+15551234567'), true);
  assert.equal(isValidE164('5551234567'), false);
  assert.equal(maskPhone('+15551234567'), '••••4567');
});

test('cannot demote owner, self, or last admin', () => {
  const actor = { id: 1, email: 'a@x.com', role: 'admin' };
  const owner = { id: 2, email: 'owner@example.com', role: 'admin' };
  const other = { id: 3, email: 'b@x.com', role: 'admin' };
  const prev = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = 'owner@example.com';

  assert.equal(canChangeAdminRole({ actor, target: owner, nextRole: 'user', adminCount: 3 }).ok, false);
  assert.equal(canChangeAdminRole({ actor, target: actor, nextRole: 'user', adminCount: 3 }).ok, false);
  assert.equal(canChangeAdminRole({ actor, target: other, nextRole: 'user', adminCount: 1 }).ok, false);
  assert.equal(canChangeAdminRole({ actor, target: other, nextRole: 'user', adminCount: 2 }).ok, true);
  assert.equal(canChangeAdminRole({ actor, target: other, nextRole: 'admin', adminCount: 1 }).ok, true);

  process.env.ADMIN_EMAIL = prev;
});

test('cannot delete self, owner, or last admin', () => {
  const actor = { id: 1, email: 'a@x.com', role: 'admin' };
  const prev = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = 'owner@example.com';
  assert.equal(canDeleteUser({ actor, target: actor, adminCount: 5 }).ok, false);
  assert.equal(canDeleteUser({ actor, target: { id: 9, email: 'owner@example.com', role: 'admin' }, adminCount: 5 }).ok, false);
  assert.equal(canDeleteUser({ actor, target: { id: 4, email: 'c@x.com', role: 'admin' }, adminCount: 1 }).ok, false);
  assert.equal(canDeleteUser({ actor, target: { id: 4, email: 'c@x.com', role: 'user' }, adminCount: 1 }).ok, true);
  process.env.ADMIN_EMAIL = prev;
});

test('cannot ban self or owner', () => {
  const actor = { id: 1, email: 'a@x.com', role: 'admin' };
  const prev = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = 'owner@example.com';
  assert.equal(canBanUser({ actor, target: actor }).ok, false);
  assert.equal(canBanUser({ actor, target: { id: 2, email: 'owner@example.com' } }).ok, false);
  assert.equal(canBanUser({ actor, target: { id: 3, email: 'user@example.com' } }).ok, true);
  process.env.ADMIN_EMAIL = prev;
});

test('public quota widget never exposes GCP internals and falls back to self-count', () => {
  const { publicQuotaView } = require('../services/gcpMonitoring');
  const live = publicQuotaView({ configured: true, used: 412, projectId: 'secret-proj', filter: 'hide-me', note: 'internal' }, 28, 1500);
  assert.equal(live.used, 412);
  assert.equal(live.limit, 1500);
  assert.equal(live.remaining, 1088);
  assert.equal(live.source, 'google-cloud-monitoring');
  assert.equal(live.selfUsed, 28);
  assert.equal(Object.prototype.hasOwnProperty.call(live, 'projectId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(live, 'filter'), false);

  const down = publicQuotaView({ configured: true, used: null, error: 'boom' }, 28, 1500);
  assert.equal(down.used, 28);
  assert.equal(down.source, 'smart-study');
});

test('Cloud Monitoring filter targets Generative Language request_count', () => {
  const filter = gcpRequestCountFilter();
  assert.match(filter, /serviceruntime\.googleapis\.com\/api\/request_count/);
  assert.match(filter, /consumed_api/);
  assert.match(filter, /generativelanguage\.googleapis\.com/);
  assert.equal(filter.includes('metric.type="://googleapis.com"'), false);
});

test('OTP hashes are compared in constant time and bind to user+purpose', () => {
  const a = otp.hashCode('123456', 7, 'admin_unlock');
  const b = otp.hashCode('123456', 7, 'admin_unlock');
  const c = otp.hashCode('123456', 8, 'admin_unlock');
  const d = otp.hashCode('000000', 7, 'admin_unlock');
  assert.equal(otp.safeEqual(a, b), true);
  assert.equal(otp.safeEqual(a, c), false);
  assert.equal(otp.safeEqual(a, d), false);
  assert.match(a, /^[a-f0-9]{64}$/);
});
