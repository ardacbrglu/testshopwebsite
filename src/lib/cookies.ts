export const CART_COOKIE = "cartId";
export const REF_COOKIE  = "cabo_attrib"; // JSON: {token?, lid?, slug?, ts}

export type SameSite = "lax" | "strict" | "none";
export type CookieValue = { name: string; value: string };
export interface CookieStore {
  get(name: string): CookieValue | undefined;
  set(
    name: string,
    value: string,
    options: { httpOnly?: boolean; sameSite?: SameSite; secure?: boolean; path?: string; maxAge?: number }
  ): void;
}

export type ReferralAttrib = { token?: string | null; lid?: string | number | null; slug?: string | null; ts?: number | null; };

export function readCartId(c: CookieStore): string | null {
  const v = c.get(CART_COOKIE)?.value;
  return v ?? null;
}

export function writeCartId(c: CookieStore, id: string) {
  c.set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function readReferralCookie(c: CookieStore): ReferralAttrib | null {
  const raw = c.get(REF_COOKIE)?.value;
  if (!raw) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(raw));
    if (!obj || typeof obj !== "object" || !("ts" in obj)) return null;
    return {
      token: obj.token ?? null,
      lid: obj.lid ?? null,
      slug: obj.slug ?? null,
      ts: Number(obj.ts) || 0,
    };
  } catch {
    return null;
  }
}

export function writeReferralCookie(
  c: CookieStore,
  data: { token?: string; lid?: string | number; slug?: string; ts?: number }
) {
  const days = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
  const maxAge = Math.max(1, Math.round(days * 24 * 60 * 60));
  const value = encodeURIComponent(
    JSON.stringify({ ...data, ts: data.ts ?? Math.floor(Date.now() / 1000) })
  );
  c.set(REF_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export function clearReferralCookie(c: CookieStore) {
  c.set(REF_COOKIE, "", { path: "/", maxAge: 0 });
}

/** TTL kontrolü (saniye) */
export function isReferralValid(attrib?: { ts?: number | null } | null): boolean {
  if (!attrib) return false;
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(attrib.ts || 0);
  if (ts <= 0) return false;
  if (now < ts) return false;
  const ttl = Number(process.env.CABO_ATTRIB_TTL_SEC || 3600);
  return now - ts <= ttl;
}
