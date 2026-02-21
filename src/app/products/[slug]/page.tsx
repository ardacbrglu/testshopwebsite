// src/app/products/[slug]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/queries";
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

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const slug = String(params.slug || "");
  const p = await getProductBySlug(slug);
  if (!p) notFound();

  const c = (await cookies()) as unknown as CookieStore;
  const ref = readReferralCookie(c);
  const refOk = isReferralValid(ref);

  const map = loadMap();
  const scope = getAttributionScope();

  const eligible = refOk && ref ? isSlugEligible(scope, map, slug, ref) : false;
  const pct = eligible ? normalizePct(map[slug]?.discount) : 0;
  const hasDiscount = eligible && pct > 0;
  const finalCents = hasDiscount ? applyPct(p.priceCents, pct) : p.priceCents;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/products" className="text-sm underline underline-offset-4">
          ← Products
        </Link>
        <Link href="/cart" className="text-sm underline underline-offset-4">
          Cart →
        </Link>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-6">
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <p className="mt-2 text-neutral-400">{p.description}</p>

        <div className="mt-4 flex items-center gap-3">
          <div className="text-xl font-semibold">{formatTRY(finalCents)}</div>
          {hasDiscount ? (
            <>
              <div className="text-sm text-neutral-500 line-through">{formatTRY(p.priceCents)}</div>
              <div className="text-xs rounded-full border border-neutral-700 px-2 py-1 text-emerald-300">
                %{Math.round(pct)} indirim
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-5">
          <AddToCartWidget slug={p.slug} productId={p.id} />
        </div>
      </div>
    </div>
  );
}