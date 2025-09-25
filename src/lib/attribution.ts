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

/** "10%" -> 10 */
function parsePercent(text?: string): number {
  if (!text) return 0;
  const m = /(\d+(?:\.\d+)?)%/.exec(text);
  return m ? Math.max(0, Math.min(90, Number(m[1]))) : 0;
}

/** Ref aktif mi? (server) */
export async function isAttributionActiveServer(): Promise<boolean> {
  const store = await cookies();
  return Boolean(store.get("cabo_wid")?.value);
}

/** Ürün slug’ına göre, ref aktifleştirildiyse yüzdeyi döndür (server) */
export async function activeDiscountPctForSlugServer(slug: string): Promise<number> {
  const active = await isAttributionActiveServer();
  if (!active) return 0;
  return parsePercent(MAP[slug]?.discount);
}

/** Ürün slug’ından ürün kodunu ver (Cabo postback için) */
export function productCodeForSlug(slug: string): string | undefined {
  return MAP[slug]?.code;
}
