import { getProductBySlug } from "@/lib/queries";
import { formatTRY } from "@/lib/money";
import AddToCartWidget from "../../../components/AddToCartWidget";
import { cookies } from "next/headers";
import { readReferralCookie } from "@/lib/cookies";
import { applyDiscountsToItems, isReferralValid } from "@/lib/discounter";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return <div className="p-6">Ürün bulunamadı.</div>;

  const c = await cookies();
  const ref = readReferralCookie(c);
  const enabled = isReferralValid(ref);

  let pct = 0, finalPrice = product.priceCents;
  if (enabled) {
    const one = applyDiscountsToItems([{
      product_id: product.id, slug: product.slug, name: product.name,
      image_url: product.imageUrl, quantity: 1, unit_price_cents: product.priceCents,
    }], { enabled, referral: ref }).items[0];
    pct = one.discountPct; finalPrice = one.finalUnitPriceCents;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={product.imageUrl || ""} alt={product.name} className="w-full h-80 object-cover rounded-xl" />
      <div>
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <p className="text-neutral-400 mt-2">{product.description}</p>
        <div className="mt-4 text-xl font-bold flex items-center gap-2">
          {pct > 0 ? (
            <>
              <span className="text-neutral-500 line-through">{formatTRY(product.priceCents)}</span>
              <span>{formatTRY(finalPrice)}</span>
              <span className="text-emerald-400 text-sm">%{pct} indirim</span>
            </>
          ) : (
            <span>{formatTRY(product.priceCents)}</span>
          )}
        </div>
        <AddToCartWidget slug={product.slug} />
      </div>
    </div>
  );
}
