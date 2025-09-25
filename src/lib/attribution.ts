// src/lib/attribution.ts
import { cookies } from "next/headers";

type MapEntry = { code: string; discount?: string };
type MapJson = Record<string, MapEntry>;

function safeParseMap(envVal: string | undefined): MapJson {
  if (!envVal) return {};
  try {
    const parsed = JSON.parse(envVal) as unknown;
    if (parsed && typeof parsed === "object") return parsed as MapJson;
  } catch {}
  return {};
}

const MAP: MapJson = safeParseMap(process.env.CABO_MAP_JSON);
const SCOPE = (process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").toLowerCase(); // "sitewide" | "landing"

function parsePercent(text?: string): number {
  if (!text) return 0;
  const m = /(\d+(?:\.\d+)?)%/.exec(text);
  return m ? Math.max(0, Math.min(90, Number(m[1]))) : 0;
}

/** Ref aktif mi? Env scope’a göre kontrol eder. */
export async function isAttributionActiveServer(slug?: string): Promise<boolean> {
  const store = await cookies();
  const wid = store.get("cabo_wid")?.value;
  if (!wid) return false;

  if (SCOPE === "landing") {
    if (!slug) return false;
    const landing = store.get("cabo_landing_slug")?.value;
    return landing === slug;
  }

  // sitewide
  return true;
}

/** Slug için aktif indirim yüzdesi (env ve cookie kurallarına göre). */
export async function activeDiscountPctForSlugServer(slug: string): Promise<number> {
  const ok = await isAttributionActiveServer(slug);
  if (!ok) return 0;
  return parsePercent(MAP[slug]?.discount);
}

/** Cabo postback’te kullanacağımız ürün kodu */
export function productCodeForSlug(slug: string): string | undefined {
  return MAP[slug]?.code;
}
