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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Referral cookie reader
 * - Yeni doğru format: JSON string (cookie API zaten encode eder)
 * - Eski yanlış format: encodeURIComponent(JSON) -> double-encoded (%257B...)
 * Bu yüzden: raw, decode1, decode2 deniyoruz.
 */
export function readReferralCookie(c: CookieStore): ReferralAttrib | null {
  const raw = c.get(REF_COOKIE)?.value;
  if (!raw) return null;

  const candidates: string[] = [raw];

  try {
    candidates.push(decodeURIComponent(raw));
  } catch {}

  try {
    const last = candidates[candidates.length - 1];
    candidates.push(decodeURIComponent(last));
  } catch {}

  for (const s of candidates) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (!isRecord(parsed)) continue;

      // ts zorunlu (yoksa attrib sayma)
      const tsVal = parsed["ts"];
      const ts = Number(tsVal);
      if (!Number.isFinite(ts) || ts <= 0) continue;

      const tokenRaw = parsed["token"];
      const lidRaw = parsed["lid"];
      const slugRaw = parsed["slug"];

      const token = typeof tokenRaw === "string" ? tokenRaw : tokenRaw == null ? null : String(tokenRaw);
      const slug = typeof slugRaw === "string" ? slugRaw : slugRaw == null ? null : String(slugRaw);

      let lid: string | number | null = null;
      if (typeof lidRaw === "number" && Number.isFinite(lidRaw)) lid = lidRaw;
      else if (typeof lidRaw === "string" && lidRaw.trim() !== "") {
        const n = Number(lidRaw);
        lid = Number.isFinite(n) ? n : lidRaw;
      } else if (lidRaw != null) {
        lid = String(lidRaw);
      }

      return { token, lid, slug, ts };
    } catch {
      // continue
    }
  }

  return null;
}

export function writeReferralCookie(
  c: CookieStore,
  data: { token?: string; lid?: string | number; slug?: string; ts?: number }
) {
  const days = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
  const maxAge = Math.max(1, Math.round(days * 24 * 60 * 60));

  // ❗ encodeURIComponent YOK (double-encode bugını önler)
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
