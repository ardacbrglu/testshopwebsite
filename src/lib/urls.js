// src/lib/urls.js
export function absoluteFromReq(req, path) {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
  const host  = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  const base  = `${proto}://${host}`;
  if (/^https?:\/\//i.test(path)) return path;
  return base + (path.startsWith("/") ? path : `/${path}`);
}
