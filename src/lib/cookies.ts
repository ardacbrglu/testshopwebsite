import { cookies as nextCookies } from "next/headers";

export const CART_COOKIE = "cartId";
export const REF_COOKIE = "cabo_attrib"; // JSON: {token?:string,lid?:string,ts:number}

type CookieStore = Awaited<ReturnType<typeof nextCookies>>;

export function readCartId(c: CookieStore): string | null {
  const v = (c as any).get?.(CART_COOKIE)?.value;
  return v || null;
}
export function writeCartId(c: CookieStore, id: string) {
  const maxAge = 60 * 60 * 24 * 365;
  (c as any).set?.(CART_COOKIE, id, {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/", maxAge,
  });
}

export function readReferralCookie(
  c: CookieStore
): { token?: string; lid?: string; ts?: number } | null {
  const raw = (c as any).get?.(REF_COOKIE)?.value;
  if (!raw) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(raw));
    if (!obj || typeof obj !== "object" || !("ts" in obj)) return null;
    return { token: obj.token, lid: obj.lid, ts: Number(obj.ts) || 0 };
  } catch { return null; }
}

export function writeReferralCookie(
  c: CookieStore,
  data: { token?: string; lid?: string; ts?: number }
) {
  const days = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
  const maxAge = Math.max(1, Math.round(days * 24 * 60 * 60));
  const value = encodeURIComponent(JSON.stringify({ ...data, ts: data.ts ?? Math.floor(Date.now() / 1000) }));
  (c as any).set?.(REF_COOKIE, value, {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/", maxAge,
  });
}

export function clearReferralCookie(c: CookieStore) {
  (c as any).set?.(REF_COOKIE, "", { path: "/", maxAge: 0 });
}
