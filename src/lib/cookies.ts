// src/lib/cookies.ts
export const CART_COOKIE = "cartId";
export const REF_COOKIE = "cabo_attrib"; // JSON: {token?, lid?, slug?, ts, v:1}

export type SameSite = "lax" | "strict" | "none";
export type CookieValue = { name: string; value: string };
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

export type ReferralAttrib = {
  token?: string | null;
  lid?: string | number | null;
  slug?: string | null;
  ts?: number | null;
  v?: number | null; // ✅ verified flag
};

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

type UnknownRecord = Record<string, unknown>;

function safeDecodeMaybeTwice(input: string): string {
  let s = input;
  for (let i = 0; i < 2; i++) {
    try {
      const d = decodeURIComponent(s);
      if (d === s) break;
      s = d;
    } catch {
      break;
    }
  }
  return s;
}

export function readReferralCookie(c: CookieStore): ReferralAttrib | null {
  const raw = c.get(REF_COOKIE)?.value;
  if (!raw) return null;

  try {
    const decoded = safeDecodeMaybeTwice(raw);
    const parsed: unknown = JSON.parse(decoded);

    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as UnknownRecord;

    // ts yoksa geçersiz
    if (!("ts" in obj)) return null;

    return {
      token: typeof obj.token === "string" ? obj.token : obj.token == null ? null : String(obj.token),
      lid:
        typeof obj.lid === "number" || typeof obj.lid === "string"
          ? obj.lid
          : obj.lid == null
          ? null
          : String(obj.lid),
      slug: typeof obj.slug === "string" ? obj.slug : obj.slug == null ? null : String(obj.slug),
      ts: Number(obj.ts) || 0,
      v: Number((obj as any).v ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

export function clearReferralCookie(c: CookieStore) {
  c.set(REF_COOKIE, "", { path: "/", maxAge: 0 });
}

/** TTL kontrolü (saniye) + ✅ verified flag */
export function isReferralValid(attrib?: { ts?: number | null; v?: number | null } | null): boolean {
  if (!attrib) return false;

  // ✅ sadece verified cookie kabul
  const v = Number((attrib as any).v || 0);
  if (v !== 1) return false;

  const now = Math.floor(Date.now() / 1000);
  const ts = Number(attrib.ts || 0);
  if (ts <= 0) return false;
  if (now < ts) return false;

  const ttl = Number(process.env.CABO_ATTRIB_TTL_SEC || 3600);
  return now - ts <= ttl;
}
