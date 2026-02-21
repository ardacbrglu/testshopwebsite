// src/app/products/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { getAllProducts } from "@/lib/queries";
import type { Product } from "@/lib/types";
import { readReferralCookie, isReferralValid, type CookieStore } from "@/lib/cookies";
import { loadMap, getAttributionScope, isSlugEligible } from "@/lib/discounter";

function formatCentsTRY(cents: number) {
  const value = (Number(cents || 0) / 100).toFixed(2);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(value));
}

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
  const products: Product[] = await getAllProducts();

  const c = (await cookies()) as unknown as CookieStore;
  const ref = readReferralCookie(c);
  const refOk = isReferralValid(ref);

  const map = loadMap();
  const scope = getAttributionScope();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Link href="/cart" className="text-sm underline underline-offset-4">
          Cart
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const eligible = refOk && ref ? isSlugEligible(scope, map, p.slug, ref) : false;
          const pct = eligible ? normalizePct(map[p.slug]?.discount) : 0;
          const hasDiscount = eligible && pct > 0;

          const finalCents = hasDiscount ? applyPct(p.priceCents, pct) : p.priceCents;

          return (
            <Link
              key={p.id}
              href={`/products/${p.slug}`}
              className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 hover:bg-neutral-950/60 transition"
            >
              <div className="aspect-[16/10] w-full overflow-hidden rounded-xl bg-neutral-900">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>

              <div className="mt-3">
                <div className="text-lg font-semibold">{p.name}</div>
                <div className="mt-2 flex items-center gap-2">
                  {hasDiscount ? (
                    <>
                      <div className="text-xl font-semibold">{formatCentsTRY(finalCents)}</div>
                      <div className="text-sm text-neutral-400 line-through">
                        {formatCentsTRY(p.priceCents)}
                      </div>
                      <div className="text-xs rounded-full border border-neutral-700 px-2 py-1">
                        -{Math.round(pct)}%
                      </div>
                    </>
                  ) : (
                    <div className="text-xl font-semibold">{formatCentsTRY(p.priceCents)}</div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}