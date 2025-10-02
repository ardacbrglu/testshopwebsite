/** İndirim hesaplayıcı */
export type RawCartRow = {
  product_id: number;
  slug: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price_cents: number;
};

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

type MapEntry = { code?: string; discount?: string | number };
type CaboMap = Record<string, MapEntry>;

function loadMap(): CaboMap {
  try { return JSON.parse(process.env.CABO_MAP_JSON || "{}"); }
  catch { return {}; }
}

function normalizePct(p?: string | number): number {
  if (p == null) return 0;
  if (typeof p === "number") return p <= 1 ? Math.round(p * 100) : Math.round(p);
  const s = String(p).trim();
  if (!s) return 0;
  if (s.endsWith("%")) return Math.round(Number(s.slice(0, -1)));
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

/** Referral cookie TTL kontrolü (saniye) */
export function isReferralValid(attrib?: { ts?: number | null } | null): boolean {
  if (!attrib) return false;
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(attrib.ts || 0);
  if (ts <= 0) return false;
  if (now < ts) return false;
  const ttl = Number(process.env.CABO_ATTRIB_TTL_SEC || 3600);
  return now - ts <= ttl;
}

/** Slug için indirim uygula */
function discountForSlug(slug: string, unit: number) {
  const map = loadMap();
  const pct = normalizePct(map[slug]?.discount);
  const finalUnit = Math.max(0, Math.round(unit * (1 - pct / 100)));
  return { pct, finalUnit };
}

/** rows: getCartItemsRaw; ref geçerliyse indirim uygular */
export function applyDiscountsToItems(
  rows: RawCartRow[],
  opts?: { enabled?: boolean; referral?: { ts?: number | null } | null }
) {
  const enabled = !!opts?.enabled && isReferralValid(opts?.referral);

  const items: ApiCartItem[] = rows.map((r) => {
    const unit = Number(r.unit_price_cents || 0);
    let pct = 0;
    let finalUnit = unit;
    if (enabled) {
      const d = discountForSlug(r.slug, unit);
      pct = d.pct;
      finalUnit = d.finalUnit;
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
