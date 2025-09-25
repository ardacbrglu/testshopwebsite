// src/lib/attribution.ts

export type Scope = "sitewide" | "landing";

export interface AttributionCookiePayload {
  token: string;
  lid: string | null;
  scope: Scope;
  landingProduct: string | null;
  pc: string | null;
  pid: string | null;
  iat: number;
  wid?: string; // window/tab id
}

export interface AttributionVerified extends AttributionCookiePayload {
  valid: true;
}

export interface DiscountResult {
  finalPrice: number;   // kuruş
  applied: boolean;
  discountPct: number;  // 0..90
}

type CaboMap = Record<string, { code?: string; discount?: string | number }>;

function env<T = string>(name: string, fallback?: T): T {
  const v = process.env[name];
  return (v === undefined ? (fallback as T) : (v as unknown as T));
}

function safeB64Decode(b64: string): string | null {
  try { return Buffer.from(b64, "base64").toString("utf8"); } catch { return null; }
}

function hmacHex(secret: string, message: string): string {
  const crypto = require("crypto") as typeof import("crypto");
  return crypto.createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(message, "utf8")
    .digest("hex");
}

/** Cookie string -> doğrulanmış atribüsyon (veya null) */
export function getAttributionFromCookie(
  cookieValue: string | undefined,
  slugForLandingCheck?: string,
  opts?: { wid?: string; enforceWid?: boolean }
): AttributionVerified | null {
  if (!cookieValue) return null;

  const secret =
    env("TESTSHOP_COOKIE_SECRET") ||
    env("CABO_HMAC_SECRET") ||
    "dev-secret";

  const [b64, sig] = cookieValue.split(".");
  if (!b64 || !sig) return null;

  const raw = safeB64Decode(b64);
  if (!raw) return null;

  const expected = hmacHex(secret, raw);
  if (expected !== sig) return null;

  let parsed: AttributionCookiePayload | null = null;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed.token !== "string") return null;

  // scope filtresi
  const scope = (env("CABO_ATTRIBUTION_SCOPE", "sitewide") as Scope);
  if (scope === "landing") {
    if (!slugForLandingCheck) return null;
    if (parsed.landingProduct !== slugForLandingCheck) return null;
  }

  // tab/wid zorlaması (istenirse)
  if (opts?.enforceWid) {
    const reqWid = opts.wid || "";
    if (!parsed.wid || !reqWid || parsed.wid !== reqWid) return null;
  }

  return { ...parsed, valid: true };
}

/** env’den product -> {code, discount} map */
function getCaboMap(): CaboMap {
  try {
    const raw = env("CABO_MAP_JSON", "{}");
    return JSON.parse(raw) as CaboMap;
  } catch {
    return {};
  }
}

export function getProductCodeFromMap(slug: string): string | null {
  const map = getCaboMap();
  const ent = map[slug];
  return ent?.code ? String(ent.code) : null;
}

export function getDiscountPctForSlug(slug: string): number {
  const map = getCaboMap();
  const ent = map[slug];
  if (!ent?.discount) return 0;
  const d = typeof ent.discount === "string" ? ent.discount.trim() : String(ent.discount);
  if (d.endsWith("%")) {
    const num = Number(d.slice(0, -1));
    return Number.isFinite(num) ? Math.max(0, Math.min(90, num)) : 0;
    }
  const num = Number(d);
  return Number.isFinite(num) ? Math.max(0, Math.min(90, num)) : 0;
}

/** İndirim hesapla (cookie + scope + (opsiyonel) wid eşleşmesi) */
export function calcDiscountedUnitPrice(
  unitPrice: number,   // kuruş
  slug: string,
  opts?: { attributionCookie?: string; wid?: string; enforceWid?: boolean }
): DiscountResult {
  const attrib = getAttributionFromCookie(
    opts?.attributionCookie,
    slug,
    { wid: opts?.wid, enforceWid: !!opts?.enforceWid }
  );
  if (!attrib) return { finalPrice: unitPrice, applied: false, discountPct: 0 };

  const pct = getDiscountPctForSlug(slug);
  if (pct <= 0) return { finalPrice: unitPrice, applied: false, discountPct: 0 };

  const discounted = Math.round(unitPrice * (100 - pct) / 100);
  return { finalPrice: discounted, applied: true, discountPct: pct };
}
