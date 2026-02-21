// src/app/products/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { cookies } from "next/headers";
import { getAllProducts } from "@/lib/queries";
import { readReferralCookie, isReferralValid, type CookieStore } from "@/lib/cookies";
import { loadMap, getAttributionScope, isSlugEligible } from "@/lib/discounter";
import { formatTRY } from "@/lib/money";
import AddToCartWidget from "@/components/AddToCartWidget";

function applyPct(priceCents: number, pct: number) {
  const p = Math.max(0, Number(priceCents) || 0);
  const d = Math.max(0, Math.min(95, Number(pct) || 0));
  return Math.round(p * (1 - d / 100));
}
function normalizePct(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v <= 1 ? v * 100 : v;
  if (typeof v !== "string") return 0;
  const s = v.trim();
  if (!s) return 0;
  if (s.endsWith("%")) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? n * 100 : n;
}

export default async function ProductsPage() {
  const c = (await cookies()) as unknown as CookieStore;
  const ref = readReferralCookie(c);
  const refOk = isReferralValid(ref);

  const map = loadMap();
  const scope = getAttributionScope();

  const products = await getAllProducts();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Link href="/cart" className="text-sm underline underline-offset-4">
          Cart →
        </Link>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-300">
        <div>
          Referral:{" "}
          <span className={refOk ? "text-emerald-300" : "text-neutral-400"}>
            {refOk ? "ACTIVE" : "NONE"}
          </span>
        </div>
        {refOk && ref ? (
          <div className="mt-1 text-neutral-400">
            scope: {scope} | token: {ref.token.slice(0, 8)}… | lid: {ref.lid}
            {ref.verifiedSlug ? ` | verifiedSlug: ${ref.verifiedSlug}` : ""}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const eligible = refOk && ref ? isSlugEligible(scope, map, p.slug, ref) : false;
          const pct = eligible ? normalizePct(map[p.slug]?.discount) : 0;
          const hasDiscount = eligible && pct > 0;
          const finalCents = hasDiscount ? applyPct(p.priceCents, pct) : p.priceCents;

          return (
            <div key={p.slug} className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/40">
              <Link href={`/products/${p.slug}`} className="block">
                <div className="p-4">
                  <div className="text-lg font-semibold">{p.name}</div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="font-semibold">{formatTRY(finalCents)}</div>
                    {hasDiscount ? (
                      <>
                        <div className="text-xs text-neutral-500 line-through">{formatTRY(p.priceCents)}</div>
                        <div className="text-[11px] rounded-full border border-neutral-700 px-2 py-1">
                          -{Math.round(pct)}%
                        </div>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-3 text-sm text-neutral-400 line-clamp-2">{p.description}</div>
                </div>
              </Link>

              <div className="p-4 pt-0">
                <AddToCartWidget slug={p.slug} productId={p.id} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}