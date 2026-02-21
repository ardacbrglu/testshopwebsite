// src/app/products/[slug]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { getProductBySlug } from "@/lib/queries";
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

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product: Product | null = await getProductBySlug(params.slug);
  if (!product) return notFound();

  const c = (await cookies()) as unknown as CookieStore;
  const ref = readReferralCookie(c);
  const refOk = isReferralValid(ref);

  const map = loadMap();
  const scope = getAttributionScope();

  const eligible = refOk && ref ? isSlugEligible(scope, map, product.slug, ref) : false;
  const pct = eligible ? normalizePct(map[product.slug]?.discount) : 0;
  const hasDiscount = eligible && pct > 0;

  const finalCents = hasDiscount ? applyPct(product.priceCents, pct) : product.priceCents;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/products" className="text-sm underline underline-offset-4">
          ← Back to Products
        </Link>
        <Link href="/cart" className="text-sm underline underline-offset-4">
          Cart
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/40">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-[420px] w-full object-cover"
            />
          ) : (
            <div className="h-[420px] w-full bg-neutral-900" />
          )}
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
          <div className="text-2xl font-semibold">{product.name}</div>
          <div className="mt-3 text-neutral-400">{product.description}</div>

          <div className="mt-6 flex items-center gap-3">
            {hasDiscount ? (
              <>
                <div className="text-2xl font-semibold">{formatCentsTRY(finalCents)}</div>
                <div className="text-sm text-neutral-400 line-through">
                  {formatCentsTRY(product.priceCents)}
                </div>
                <div className="text-xs rounded-full border border-neutral-700 px-2 py-1">
                  -{Math.round(pct)}%
                </div>
              </>
            ) : (
              <div className="text-2xl font-semibold">{formatCentsTRY(product.priceCents)}</div>
            )}
          </div>

          {/* ✅ Server-side form POST to /api/cart (route.ts now supports formData) */}
          <form action="/api/cart" method="post" className="mt-5">
            <input type="hidden" name="slug" value={product.slug} />
            <input type="hidden" name="quantity" value="1" />
            <button
              type="submit"
              className="w-full rounded-xl border border-neutral-700 px-4 py-3 hover:bg-neutral-900"
            >
              Add to cart
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}