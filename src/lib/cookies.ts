// src/lib/cookies.ts
export const CART_COOKIE = "cartId";
export const REF_COOKIE = "cabo_attrib"; // JSON: {token?, lid?, slug?, ts}

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
  // %257B... gibi double-encode olmuş değerleri tolere et
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

function asStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function asStringOrNumberOrNull(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  return null;
}

function asNumberOrZero(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function readReferralCookie(c: CookieStore): ReferralAttrib | null {
  const raw = c.get(REF_COOKIE)?.value;
  if (!raw) return null;

  try {
    const decoded = safeDecodeMaybeTwice(raw);
    const parsed: unknown = JSON.parse(decoded);

    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as UnknownRecord;

    // ts yoksa geçersiz say
    if (!("ts" in obj)) return null;

    return {
      token: asStringOrNull(obj.token),
      lid: asStringOrNumberOrNull(obj.lid),
      slug: asStringOrNull(obj.slug),
      ts: asNumberOrZero(obj.ts),
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

  // ✅ encodeURIComponent YOK! Next cookie mekanizması encode ediyor.
  const value = JSON.stringify({
    ...data,
    ts: data.ts ?? Math.floor(Date.now() / 1000),
  });

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
