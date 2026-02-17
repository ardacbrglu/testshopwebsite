// src/lib/discounter.ts
import { isReferralValid, type Referral } from "@/lib/cookies";

export type RawCartRow = {
  productId: number;
  slug: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceCents: number;
};

export type ApiCartItem = {
  productId: number;
  slug: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceCents: number;

  discountPct: number;          // 0..100
  finalUnitPriceCents: number;  // discounted unit
  lineFinalCents: number;       // finalUnit * qty
};

type MapEntry = { code?: string; discount?: string | number };
type CaboMap = Record<string, MapEntry>;

export function loadMap(): CaboMap {
  try {
    return JSON.parse(process.env.CABO_MAP_JSON || "{}");
  } catch {
    return {};
  }
}

export function getAttributionScope(): "landing" | "sitewide" {
  const s = String(process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").toLowerCase().trim();
  return s === "landing" ? "landing" : "sitewide";
}

function normalizePct(p: string | number | undefined): number {
  if (p == null) return 0;
  if (typeof p === "number") return p <= 1 ? p * 100 : p;
  const s = String(p).trim();
  if (s.endsWith("%")) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? n * 100 : n;
}

export function isSlugEligible(
  scope: "landing" | "sitewide",
  map: CaboMap,
  slug: string,
  ref: Referral
) {
  // map’te yoksa eligible değil
  if (!map[slug]?.discount) return false;

  if (scope === "sitewide") return true;

  // landing mod: yalnız landingSlug ile eşleşen slug
  if (!ref?.landingSlug) return false;
  return ref.landingSlug === slug;
}

export function applyDiscountsToItems(
  raw: RawCartRow[],
  opts: { enabled: boolean; referral: Referral | null }
) {
  const map = loadMap();
  const scope = getAttributionScope();
  const ref = opts.referral;

  const enabled = !!opts.enabled && isReferralValid(ref);

  let subtotal = 0;
  let total = 0;

  const items: ApiCartItem[] = raw.map((r) => {
    const unit = Math.max(0, Number(r.unitPriceCents) || 0);
    const qty = Math.max(1, Number(r.quantity) || 1);
    subtotal += unit * qty;

    let pct = 0;
    if (enabled && ref && isSlugEligible(scope, map, r.slug, ref)) {
      pct = normalizePct(map[r.slug]?.discount);
      if (!Number.isFinite(pct) || pct < 0) pct = 0;
      if (pct > 95) pct = 95;
    }

    const finalUnit = Math.max(0, Math.round(unit * (1 - pct / 100)));
    const lineFinal = finalUnit * qty;
    total += lineFinal;

    return {
      productId: Number(r.productId),
      slug: String(r.slug),
      name: String(r.name),
      imageUrl: String(r.imageUrl || ""),
      quantity: qty,
      unitPriceCents: unit,
      discountPct: Math.round(pct),
      finalUnitPriceCents: finalUnit,
      lineFinalCents: lineFinal,
    };
  });

  const discount = Math.max(0, subtotal - total);

  return { items, subtotal, total, discount };
}
