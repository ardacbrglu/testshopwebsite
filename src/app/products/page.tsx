export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getAllProducts } from "@/lib/queries";
import { formatTRY } from "@/lib/money";
import Link from "next/link";
import { cookies } from "next/headers";
import { readReferralCookie, type CookieStore, isReferralValid, type ReferralAttrib } from "@/lib/cookies";
import { applyDiscountsToItems } from "@/lib/discounter";

const PLACEHOLDER = "https://placehold.co/800x600?text=Product";

function buildRenderReferral(searchParams?: Record<string, string | string[] | undefined>): ReferralAttrib | null {
  const token = typeof searchParams?.token === "string" ? searchParams!.token.trim() : "";
  const lid = typeof searchParams?.lid === "string" ? searchParams!.lid.trim() : "";
  const linkId = typeof searchParams?.linkId === "string" ? searchParams!.linkId.trim() : "";
  const slug = typeof searchParams?.slug === "string" ? searchParams!.slug.trim() : "";

  const effectiveLid = lid || linkId;

  // Cabo verify şu an lid istiyor; render-time indirim için de lid şart koyalım.
  if (!token || token.length < 16) return null;
  if (!effectiveLid) return null;

  const ts = Math.floor(Date.now() / 1000);
  return { token, lid: effectiveLid, slug: slug || null, ts };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const products = await getAllProducts();

  const sp = (await searchParams) || {};
  const c = (await cookies()) as unknown as CookieStore;

  const refCookie = readReferralCookie(c);
  const refFromUrl = buildRenderReferral(sp);

  const ref = isReferralValid(refCookie) ? refCookie : refFromUrl;
  const enabled = isReferralValid(ref);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-semibold mb-6">Ürünler</h1>

      <div className="grid md:grid-cols-3 gap-6">
        {products.map((p) => {
          const price = p.priceCents;
          let pct = 0;
          let finalPrice = p.priceCents;

          if (enabled && ref) {
            const one = applyDiscountsToItems(
              [
                {
                  product_id: p.id,
                  slug: p.slug,
                  name: p.name,
                  image_url: p.imageUrl || "",
                  quantity: 1,
                  unit_price_cents: p.priceCents,
                },
              ],
              { enabled, referral: ref }
            ).items[0];

            pct = one.discountPct;
            finalPrice = one.finalUnitPriceCents;
          }

          const img = p.imageUrl?.trim() ? p.imageUrl : PLACEHOLDER;

          return (
            <Link
              key={p.id}
              href={`/products/${p.slug}`}
              className="card block overflow-hidden hover:border-neutral-600 transition"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={p.name} className="w-full h-56 object-cover" />

              <div className="p-4">
                <div className="font-semibold">{p.name}</div>
                <div className="text-neutral-400 text-sm mt-1 line-clamp-2">{p.description}</div>

                <div className="mt-2 font-bold flex items-center gap-2">
                  {pct > 0 ? (
                    <>
                      <span className="text-neutral-500 line-through">{formatTRY(price)}</span>
                      <span>{formatTRY(finalPrice)}</span>
                      <span className="text-emerald-400 text-xs">%{pct} indirim</span>
                    </>
                  ) : (
                    <span>{formatTRY(price)}</span>
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
