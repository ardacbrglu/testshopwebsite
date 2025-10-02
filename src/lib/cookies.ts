export const CART_COOKIE = "cartId";
export const REF_COOKIE = "cabo_attrib"; // JSON: {token?:string,lid?:string,ts:number}

export type CookieValue = { name: string; value: string };
export type SameSite = "lax" | "strict" | "none";

export interface CookieStore {
  get(name: string): CookieValue | undefined;
  set(
    name: string,
    value: string,
    options: {
      httpOnly?: boolean;
      sameSite?: SameSite;
      secure?: boolean;
      path?: string;
      maxAge?: number;
    }
  ): void;
}

/** Cart id oku */
export function readCartId(c: CookieStore): string | null {
  const v = c.get(CART_COOKIE)?.value;
  return v ?? null;
}

/** Cart id yaz (1 yıl) */
export function writeCartId(c: CookieStore, id: string) {
  c.set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Referral cookie oku */
export function readReferralCookie(
  c: CookieStore
): { token?: string; lid?: string; ts?: number } | null {
  const raw = c.get(REF_COOKIE)?.value;
  if (!raw) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(raw));
    if (!obj || typeof obj !== "object" || !("ts" in obj)) return null;
    return { token: obj.token, lid: obj.lid, ts: Number(obj.ts) || 0 };
  } catch {
    return null;
  }
}

/** Referral cookie yaz (ts yoksa şimdi ekler) */
export function writeReferralCookie(
  c: CookieStore,
  data: { token?: string; lid?: string; ts?: number }
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

/** Referral cookie sil */
export function clearReferralCookie(c: CookieStore) {
  c.set(REF_COOKIE, "", { path: "/", maxAge: 0 });
}
