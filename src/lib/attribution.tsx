// src/lib/attribution.ts
import { cookies } from "next/headers";

type CaboMapEntry = { code: string; discount: string };
type CaboMap = Record<string, CaboMapEntry>;

const SCOPE = (process.env.CABO_ATTRIBUTION_SCOPE || "sitewide").toLowerCase() as
  | "sitewide"
  | "landing";

const COOKIE_TTL_DAYS = Math.max(
  1,
  Number.isFinite(Number(process.env.CABO_COOKIE_TTL_DAYS))
    ? Number(process.env.CABO_COOKIE_TTL_DAYS)
    : 14
);
const TTL_MS = COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000;

function loadMap(): CaboMap {
  try {
    const raw = process.env.CABO_MAP_JSON || "{}";
    return JSON.parse(raw) as CaboMap;
  } catch {
    return {};
  }
}

function parsePct(maybePct: string | number | undefined): number {
  if (typeof maybePct === "number") return Math.max(0, Math.min(100, maybePct));
  const m = String(maybePct || "").match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

export function getDiscountPctForSlug(slug: string): number {
  const entry = loadMap()[slug];
  return entry ? parsePct(entry.discount) : 0;
}

export function productCodeForSlug(slug: string): string | null {
  const entry = loadMap()[slug];
  return entry?.code ?? null;
}

function envReady(): boolean {
  return (
    !!process.env.CABO_KEY_ID &&
    !!process.env.CABO_HMAC_SECRET &&
    !!process.env.CABO_WEBHOOK_URL
  );
}

function canPostForSlug(slug: string): boolean {
  // Env ve productCode zorunlu
  return envReady() && !!productCodeForSlug(slug);
}

/**
 * İndirim yüzdesi (SUNUCU) — yalnızca webhook mümkünse >0 döner.
 */
export async function activeDiscountPctForSlugServer(slug: string): Promise<number> {
  if (!canPostForSlug(slug)) return 0;

  const store = await cookies();
  // Consent şart (pazarlama çerezi)
  if (store.get("consent_marketing")?.value !== "1") return 0;

  // Attribution: wid + TTL
  const wid = store.get("cabo_wid")?.value || "";
  if (!wid) return 0;

  const seenAt = Number(store.get("cabo_seen_at")?.value || "0");
  if (!Number.isFinite(seenAt) || Date.now() - seenAt * 1000 > TTL_MS) return 0;

  if (SCOPE === "landing") {
    const lslug = store.get("cabo_landing_slug")?.value || "";
    if (lslug !== slug) return 0;
  }

  return getDiscountPctForSlug(slug);
}

export function calcDiscountedUnitPrice(unit: number, pct: number) {
  if (pct > 0) {
    const off = Math.round(unit * (pct / 100));
    return { finalPrice: unit - off, applied: true };
  }
  return { finalPrice: unit, applied: false };
}
