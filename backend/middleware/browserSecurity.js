function allowedOrigin(req) {
  if (process.env.LOCAL_DEVELOPMENT === "1")
    return ["localhost", "127.0.0.1", "[::1]"].includes(req.hostname)
      ? `${req.protocol}://${req.get("host")}`
      : "";
  const configured =
    process.env.PUBLIC_ORIGIN ||
    (process.env.SITE_ADDRESS
      ? `https://${process.env.SITE_ADDRESS}`
      : `${req.protocol}://${req.get("host")}`);
  try {
    return new URL(configured).origin;
  } catch {
    return "";
  }
}
module.exports = function browserSecurity(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  });
  if (process.env.NODE_ENV === "production")
    res.set("Strict-Transport-Security", "max-age=31536000");
  const runner = req.path === "/js/code-worker.js";
  res.set(
    "Content-Security-Policy",
    runner
      ? "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'"
      : "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.googlesyndication.com https://*.doubleclick.net; connect-src 'self' https://tessdata.projectnaptha.com https://*.googlesyndication.com https://*.doubleclick.net; worker-src 'self' blob:; frame-src https://*.googlesyndication.com https://*.doubleclick.net; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store");
    const origin = req.get("origin");
    if (
      req.path !== "/api/billing/webhook/stripe" &&
      ((origin && origin !== allowedOrigin(req)) ||
        (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
          req.get("sec-fetch-site") === "cross-site"))
    )
      return res
        .status(403)
        .json({ message: "This request must originate from this website." });
    if (origin === allowedOrigin(req)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Credentials", "true");
      res.vary("Origin");
    }
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
      res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
      return res.sendStatus(204);
    }
  }
  next();
};
