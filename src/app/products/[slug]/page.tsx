import { getProductBySlug } from "@/lib/queries";
import { cookies } from "next/headers";
import { readReferralCookie, type CookieStore } from "@/lib/cookies";
import { applyDiscountsToItems } from "@/lib/discounter";
// DOĞRU
import { isReferralValid } from "@/lib/cookies";

import { formatTRY } from "@/lib/money";
import AddToCartWidget from "@/components/AddToCartWidget";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;                // ⬅️ Next 15: params beklenir
  const product = await getProductBySlug(slug);
  if (!product) return <div className="p-6">Ürün bulunamadı.</div>;

  const c = (await cookies()) as unknown as CookieStore;
  const ref = readReferralCookie(c);
  const enabled = isReferralValid(ref);

  let pct = 0;
  let final = product.priceCents;
  if (enabled) {
    const one = applyDiscountsToItems(
      [
        {
          product_id: product.id,
          slug: product.slug,
          name: product.name,
          image_url: product.imageUrl,
          quantity: 1,
          unit_price_cents: product.priceCents,
        },
      ],
      { enabled, referral: ref }
    ).items[0];
    pct = one.discountPct;
    final = one.finalUnitPriceCents;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.imageUrl || ""}
        alt={product.name}
        className="w-full rounded-2xl object-cover"
      />
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <p className="text-neutral-400">{product.description}</p>
        <div className="text-xl font-bold flex items-center gap-2">
          {pct > 0 ? (
            <>
              <span className="text-neutral-500 line-through">
                {formatTRY(product.priceCents)}
              </span>
              <span>{formatTRY(final)}</span>
              <span className="text-emerald-400 text-xs">%{pct} indirim</span>
            </>
          ) : (
            <span>{formatTRY(product.priceCents)}</span>
          )}
        </div>
        <AddToCartWidget slug={product.slug} productId={product.id} />
      </div>
    </div>
  );
}
