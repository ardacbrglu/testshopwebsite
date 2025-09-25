// src/lib/attribution.ts

type MapEntry = { code: string; discount?: string };
type MapJson = Record<string, MapEntry>;

function safeParseMap(envVal: string | undefined): MapJson {
  if (!envVal) return {};
  try {
    const parsed = JSON.parse(envVal) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as MapJson;
    }
  } catch {
    /* noop */
  }
  return {};
}

const MAP: MapJson = safeParseMap(process.env.CABO_MAP_JSON);

export function getDiscountPctForSlug(slug: string): number {
  const d = MAP[slug]?.discount;
  if (!d) return 0;
  const m = /(\d+(?:\.\d+)?)%/.exec(d);
  return m ? Math.max(0, Math.min(90, Number(m[1]))) : 0;
}

export function calcDiscountedUnitPrice(
  unitPrice: number, // kuruş
  slug: string,
  _opts: Record<string, unknown> = {}
): { finalPrice: number; applied: boolean; reason?: string } {
  const pct = getDiscountPctForSlug(slug);
  if (pct <= 0) return { finalPrice: unitPrice, applied: false };
  const off = Math.round(unitPrice * (pct / 100));
  return { finalPrice: unitPrice - off, applied: true, reason: `sitewide ${pct}%` };
}
