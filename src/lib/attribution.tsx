// src/lib/attribution.tsx
import { cookies } from "next/headers";

type CaboMapEntry = { code: string; discount: string };
type CaboMap = Record<string, CaboMapEntry>;

/* ---------- ENV PARSING (gürültü/yorum temiz) ---------- */
function readEnvClean(name: string): string {
  const raw = process.env[name] ?? "";
  // Çift/tek tırnakları ve satır sonu # yorumlarını temizle
  const noQuotes = raw.replace(/^['"]|['"]$/g, "");
  const noInlineComment = noQuotes.replace(/\s+#.*$/, "");
  return noInlineComment.trim();
}

function readNumberEnv(name: string, def: number): number {
  const clean = readEnvClean(name);
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function scopeVal(): "sitewide" | "landing" {
  const clean = readEnvClean("CABO_ATTRIBUTION_SCOPE").toLowerCase();
  return clean === "landing" ? "landing" : "sitewide";
}

const SCOPE = scopeVal();
const COOKIE_TTL_DAYS = readNumberEnv("CABO_COOKIE_TTL_DAYS", 14);
const TTL_MS = COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000;

/* ---------- MAP ---------- */
function loadMap(): CaboMap {
  try {
    const txt = process.env.CABO_MAP_JSON || "{}";
    return JSON.parse(txt) as CaboMap;
  } catch {
    return {};
  }
}

function parsePct(maybe: string | number | undefined): number {
  if (typeof maybe === "number") return Math.max(0, Math.min(100, maybe));
  const m = String(maybe || "").match(/(-?\d+(?:\.\d+)?)\s*%/);
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
  return !!readEnvClean("CABO_KEY_ID") && !!readEnvClean("CABO_HMAC_SECRET") && !!readEnvClean("CABO_WEBHOOK_URL");
}

function canPostForSlug(slug: string): boolean {
  return envReady() && !!productCodeForSlug(slug);
}

/** SSR: İndirim yüzdesi – yalnızca webhook mümkünse >0 */
export async function activeDiscountPctForSlugServer(slug: string): Promise<number> {
  if (!canPostForSlug(slug)) return 0;

  const store = await cookies();

  // Pazarlama consent şart
  if (store.get("consent_marketing")?.value !== "1") return 0;

  // Attribution token + TTL
  const wid = store.get("cabo_wid")?.value || "";
  if (!wid) return 0;

  const seenAtSec = Number(store.get("cabo_seen_at")?.value || "0");
  if (!Number.isFinite(seenAtSec) || Date.now() - seenAtSec * 1000 > TTL_MS) return 0;

  if (SCOPE === "landing") {
    const landingSlug = store.get("cabo_landing_slug")?.value || "";
    if (landingSlug !== slug) return 0;
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
