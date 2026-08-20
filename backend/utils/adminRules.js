function ownerEmails() {
  const listed = [process.env.ADMIN_EMAIL, process.env.ADMIN_OWNER_EMAILS]
    .flatMap((value) => String(value || '').split(','))
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(listed)];
}

function notifyEmails() {
  const listed = String(process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(listed)];
}

function isOwnerEmail(email) {
  return ownerEmails().includes(String(email || '').trim().toLowerCase());
}

function isAdminUser(user) {
  if (!user) return false;
  if (isOwnerEmail(user.email)) return true;
  return String(user.role || '').toLowerCase() === 'admin';
}

function normalizePhone(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const kept = trimmed.replace(/[^\d+]/g, '');
  if (kept.startsWith('+')) return kept;
  if (/^\d{10}$/.test(kept)) return `+1${kept}`;
  if (/^1\d{10}$/.test(kept)) return `+${kept}`;
  return kept ? `+${kept}` : '';
}

function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(String(phone || ''));
}

function maskPhone(phone) {
  const value = String(phone || '');
  if (value.length < 4) return value ? '••••' : '';
  return `••••${value.slice(-4)}`;
}

function canChangeAdminRole({ actor, target, nextRole, adminCount }) {
  if (!target) return { ok: false, reason: 'User not found.' };
  const makingAdmin = nextRole === 'admin';
  if (isOwnerEmail(target.email) && !makingAdmin) {
    return { ok: false, reason: 'The owner account cannot be demoted.' };
  }
  if (actor && Number(actor.id) === Number(target.id) && !makingAdmin) {
    return { ok: false, reason: 'You cannot demote yourself.' };
  }
  if (!makingAdmin && isAdminUser(target) && Number(adminCount) <= 1) {
    return { ok: false, reason: 'Cannot demote the last admin.' };
  }
  return { ok: true };
}

function canDeleteUser({ actor, target, adminCount }) {
  if (!target) return { ok: false, reason: 'User not found.' };
  if (actor && Number(actor.id) === Number(target.id)) {
    return { ok: false, reason: 'You cannot delete your own account from admin.' };
  }
  if (isOwnerEmail(target.email)) {
    return { ok: false, reason: 'The owner account cannot be deleted.' };
  }
  if (isAdminUser(target) && Number(adminCount) <= 1) {
    return { ok: false, reason: 'Cannot delete the last admin.' };
  }
  return { ok: true };
}

function canBanUser({ actor, target }) {
  if (!target) return { ok: false, reason: 'User not found.' };
  if (actor && Number(actor.id) === Number(target.id)) {
    return { ok: false, reason: 'You cannot ban yourself.' };
  }
  if (isOwnerEmail(target.email)) {
    return { ok: false, reason: 'The owner account cannot be banned.' };
  }
  return { ok: true };
}

function gcpRequestCountFilter() {
  return [
    'metric.type="serviceruntime.googleapis.com/api/request_count"',
    'resource.type="consumed_api"',
    'resource.labels.service="generativelanguage.googleapis.com"',
  ].join(' AND ');
}

module.exports = {
  ownerEmails,
  notifyEmails,
  isOwnerEmail,
  isAdminUser,
  normalizePhone,
  isValidE164,
  maskPhone,
  canChangeAdminRole,
  canDeleteUser,
  canBanUser,
  gcpRequestCountFilter,
};
