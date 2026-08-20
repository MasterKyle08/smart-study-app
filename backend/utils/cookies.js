const COOKIE_NAME = 'ss_token';
const ADMIN_COOKIE_NAME = 'ss_admin';

function adminSessionMs() {
  const minutes = parseInt(process.env.ADMIN_SESSION_MINUTES || '20', 10);
  return Math.max(5, minutes) * 60 * 1000;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: adminSessionMs(),
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true });
  clearAdminCookie(res);
}

function setAdminCookie(res, token) {
  res.cookie(ADMIN_COOKIE_NAME, token, adminCookieOptions());
}

function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  });
}

function getAdminTokenFromRequest(req) {
  if (req.cookies && req.cookies[ADMIN_COOKIE_NAME]) return req.cookies[ADMIN_COOKIE_NAME];
  return null;
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  return null;
}

module.exports = {
  COOKIE_NAME,
  ADMIN_COOKIE_NAME,
  adminSessionMs,
  setAuthCookie,
  clearAuthCookie,
  setAdminCookie,
  clearAdminCookie,
  getTokenFromRequest,
  getAdminTokenFromRequest,
};
