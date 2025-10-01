// src/lib/attribution.ts
/**
 * Cabo Attribution & Sitewide Discounts (Next.js 15+)
 *
 * ENV
 * ----
 * CABO_ATTRIBUTION_SCOPE=sitewide|product  (default: sitewide)
 * CABO_MAP_JSON='{"product-a":{"code":"uuid","product_id":24,"discount":"10%"}...}'
 * CABO_COOKIE_TTL_DAYS=14   (middleware okur)
 */

import { cookies } from "next/headers";

export type CaboMapItem = {
  code?: string;                 // Cabo product_code (UUID)
  product_id?: string | number;  // Cabo product_id (gönderimde ekleriz)
  discount?: string;             // "10%"
};
type CaboMap = Record<string, CaboMapItem>;

const ATTR_COOKIE = "cabo_attrib";
const DEFAULT_SCOPE: "sitewide" | "product" = "sitewide";

/* ------------------------------ ENV ------------------------------ */

function safeParse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getCaboMap(): CaboMap {
  return safeParse<CaboMap>(process.env.CABO_MAP_JSON, {});
}

export function getAttributionScope(): "sitewide" | "product" {
  const v = (process.env.CABO_ATTRIBUTION_SCOPE || DEFAULT_SCOPE).toLowerCase();
  return v === "product" ? "product" : "sitewide";
}

/* --------------------------- COOKIES --------------------------- */

export async function getAttributionCookie(): Promise<{ lid: number; ts: number } | null> {
  // Next.js 15+: cookies() -> Promise<ReadonlyRequestCookies>
  const store = await cookies();
  const raw = store.get(ATTR_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lid === "number" && typeof parsed?.ts === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function getLinkIdOrNull(): Promise<number | null> {
  const c = await getAttributionCookie();
  return c?.lid ?? null;
}

export async function hasAttribution(): Promise<boolean> {
  return (await getAttributionCookie()) !== null;
}

/* --------------------------- DISCOUNT --------------------------- */

export function pctFromPercentString(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n / 100 : null;
}

export function discountRateForSlug(slug: string): number | null {
  const item = getCaboMap()[slug];
  return pctFromPercentString(item?.discount);
}

function round2(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

/**
 * Geriye dönük uyumlu sürüm:
 * calcDiscountedUnitPrice(unit, pct) → { finalPrice, applied, rate }
 *
 * - Önceden bazı dosyalar sonucu object gibi kullanıyordu (finalPrice/applied).
 * - Bu nedenle burada object dönüyoruz.
 */
export function calcDiscountedUnitPrice(unitPrice: number, pct: number) {
  const rate = pct && pct > 0 ? pct : 0;
  if (!rate) return { finalPrice: round2(unitPrice), applied: false, rate: 0 };
  return { finalPrice: round2(unitPrice * (1 - rate)), applied: true, rate };
}

/** Bu slug için indirim aktif mi? (sitewide: LID + map’te olması yeter) */
export async function isDiscountActiveForSlug(slug: string): Promise<boolean> {
  const has = await hasAttribution();
  if (!has) return false;
  const defined = !!getCaboMap()[slug];
  if (getAttributionScope() === "sitewide") return defined;
  // future: product scope daraltması
  return defined;
}

/** SSR: aktif indirim yüzdesi (0–1) */
export async function activeDiscountPctForSlugServer(slug: string): Promise<number> {
  const active = await isDiscountActiveForSlug(slug);
  if (!active) return 0;
  return discountRateForSlug(slug) || 0;
}

/** Fiyat kartı için eski/yeni değerler */
export async function pricingForDisplay(price: number, slug: string) {
  const pct = await activeDiscountPctForSlugServer(slug);
  const r = calcDiscountedUnitPrice(price, pct);
  if (!r.applied) return { hasDiscount: false, oldPrice: null as number | null, newPrice: r.finalPrice, rate: 0 };
  return { hasDiscount: true, oldPrice: round2(price), newPrice: r.finalPrice, rate: pct };
}

/* -------------------------- PRODUCT KEYS -------------------------- */

export function productCodeForSlug(slug: string): string | null {
  return getCaboMap()[slug]?.code ?? null;
}

export function productIdForSlug(slug: string): string | number | null {
  const v = getCaboMap()[slug]?.product_id;
  return v == null ? null : v;
}

/* --------------------- Backward compatible alias --------------------- */
// Projede bazı yerler bu adı kullanıyordu:
export { activeDiscountPctForSlugServer as activeDiscountPctForSlug };
