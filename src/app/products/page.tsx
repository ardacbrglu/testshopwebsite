import { getAllProducts } from "@/lib/queries";
import { formatTRY } from "@/lib/money";
import Link from "next/link";
import { cookies } from "next/headers";
import { readReferralCookie } from "@/lib/cookies";
import { applyDiscountsToItems, isReferralValid } from "@/lib/discounter";

export default async function ProductsPage() {
  const products = await getAllProducts();

  const c = await cookies();
  const ref = readReferralCookie(c);
  const enabled = isReferralValid(ref);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-semibold mb-6">Ürünler</h1>
      <div className="grid md:grid-cols-3 gap-6">
        {products.map((p) => {
          let price = p.priceCents, pct = 0, finalPrice = p.priceCents;
          if (enabled) {
            const one = applyDiscountsToItems([{
              product_id: p.id, slug: p.slug, name: p.name,
              image_url: p.imageUrl, quantity: 1, unit_price_cents: p.priceCents,
            }], { enabled, referral: ref }).items[0];
            pct = one.discountPct; finalPrice = one.finalUnitPriceCents;
          }
          return (
            <Link key={p.id} href={`/products/${p.slug}`}
              className="card block overflow-hidden hover:border-neutral-600 transition">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl || ""} alt={p.name} className="w-full h-56 object-cover" />
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
