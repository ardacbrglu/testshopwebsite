import { isReferralValid, type ReferralAttrib } from "./cookies";

/** DB’den ham gelen satır */
export type RawCartRow = {
  product_id: number;
  slug: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price_cents: number;
};

/** API’de döneceğimiz satır */
export type ApiCartItem = {
  productId: number;
  slug: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceCents: number;
  discountPct: number;
  finalUnitPriceCents: number;
  lineFinalCents: number;
};

/* ---- Attribution (landing/sitewide) ---- */
export type AttributionScope = "landing" | "sitewide";
export type MapEntry = { code?: string; discount?: string | number };
export type CaboMap = Record<string, MapEntry>;

export function getAttributionScope(): AttributionScope {
  const s = (process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").toLowerCase();
  return s === "landing" ? "landing" : "sitewide";
}

function normalizeEnvJson(raw: string): string {
  let s = String(raw || "").trim();

  // bazen Railway/CLI value'yu tırnak içine alabiliyor:
  // '"{...}"' veya "'{...}'"
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }

  // url-encoded gelirse
  // %7B%22product-a%22...
  try {
    const dec = decodeURIComponent(s);
    // decode değişiklik yaptıysa kullan
    if (dec && dec !== s) s = dec;
  } catch {}

  return s;
}

export function loadMap(): CaboMap {
  try {
    const raw = normalizeEnvJson(process.env.CABO_MAP_JSON || "{}");
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as CaboMap;
  } catch {
    return {};
  }
}

export function normalizePct(p?: string | number): number {
  if (p == null) return 0;
  if (typeof p === "number") return p <= 1 ? Math.round(p * 100) : Math.round(p);
  const s = String(p).trim();
  if (!s) return 0;
  if (s.endsWith("%")) return Math.round(Number(s.slice(0, -1)));
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

export function isSlugEligible(
  scope: AttributionScope,
  map: CaboMap,
  slug: string,
  ref: { slug?: string | null } | null
): boolean {
  if (!map[slug]) return false;
  if (scope === "sitewide") return true;
  const refSlug = (ref?.slug || "").trim();
  return !!refSlug && refSlug === slug;
}

/** İndirim uygula (landing/sitewide kurallarıyla) */
export function applyDiscountsToItems(
  rows: RawCartRow[],
  opts?: { enabled?: boolean; referral?: ReferralAttrib | null }
) {
  const map = loadMap();
  const scope = getAttributionScope();
  const enabled = !!opts?.enabled && isReferralValid(opts?.referral);

  const items: ApiCartItem[] = rows.map((r) => {
    const unit = Number(r.unit_price_cents || 0);
    let pct = 0;
    let finalUnit = unit;

    if (enabled && isSlugEligible(scope, map, r.slug, opts?.referral ?? null)) {
      pct = normalizePct(map[r.slug]?.discount);
      finalUnit = Math.max(0, Math.round(unit * (1 - pct / 100)));
    }

    const qty = Number(r.quantity || 0);
    return {
      productId: Number(r.product_id),
      slug: r.slug,
      name: r.name,
      imageUrl: r.image_url || "",
      quantity: qty,
      unitPriceCents: unit,
      discountPct: pct,
      finalUnitPriceCents: finalUnit,
      lineFinalCents: finalUnit * qty,
    };
  });

  const subtotal = items.reduce((s, it) => s + it.unitPriceCents * it.quantity, 0);
  const total = items.reduce((s, it) => s + it.finalUnitPriceCents * it.quantity, 0);
  const discount = Math.max(0, subtotal - total);

  return { items, subtotal, total, discount };
}
