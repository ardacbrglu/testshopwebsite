// src/lib/cookies.ts
import crypto from "crypto";

export type CookieStore = {
  get: (name: string) => { value: string } | undefined;
  set?: (name: string, value: string, opts?: any) => void;
  delete?: (name: string) => void;
};

const CART_COOKIE = "cart_id";
const REF_COOKIE = "cabo_attrib";

const HMAC_SECRET = String(process.env.CABO_HMAC_SECRET || "").trim();

function unb64url(s: string) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

function sign(payloadJson: string) {
  if (!HMAC_SECRET) return "";
  return crypto.createHmac("sha256", HMAC_SECRET).update(payloadJson).digest("hex");
}

function timingSafeEq(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

export function readCartId(c: CookieStore) {
  const v = c.get(CART_COOKIE)?.value;
  return v ? String(v) : null;
}

export function writeCartId(c: CookieStore, cartId: string) {
  try {
    c.set?.(CART_COOKIE, String(cartId), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  } catch {}
}

export type Referral = {
  token: string;
  lid: number;
  scope: "landing" | "sitewide";
  landingSlug: string | null;
  iat: number;
  exp: number;
};

// ✅ page.tsx’ler bunu import ediyor (senin hata 1)
export type ReferralAttrib = Referral;

export function readReferralCookie(c: CookieStore): Referral | null {
  try {
    const raw = c.get(REF_COOKIE)?.value;
    if (!raw) return null;

    const [p, sig] = raw.split(".");
    if (!p || !sig) return null;

    const json = unb64url(p);
    const expected = sign(json);
    if (!expected || !timingSafeEq(expected, sig)) return null;

    const o = JSON.parse(json);
    if (!o || o.v !== 1) return null;

    const token = String(o.token || "").trim();
    const lid = Number(o.lid);
    const scope = o.scope === "landing" ? "landing" : "sitewide";
    const landingSlug = o.landingSlug ? String(o.landingSlug) : null;
    const iat = Number(o.iat);
    const exp = Number(o.exp);

    if (!token || token.length < 16) return null;
    if (!Number.isFinite(lid) || lid <= 0) return null;
    if (!Number.isFinite(iat) || !Number.isFinite(exp)) return null;

    return { token, lid, scope, landingSlug, iat, exp };
  } catch {
    return null;
  }
}

export function isReferralValid(ref: Referral | null) {
  if (!ref) return false;
  const now = Math.floor(Date.now() / 1000);
  return ref.exp > now && !!ref.token && ref.lid > 0;
}
