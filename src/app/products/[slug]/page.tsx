// src/app/products/[slug]/page.tsx
/* eslint-disable @next/next/no-img-element */
import { query } from "@/lib/db";
import { toCurrencyTRY } from "@/lib/format";
import { activeDiscountPctForSlugServer, calcDiscountedUnitPrice } from "@/lib/attribution";
import AddToCart from "@/components/AddToCart";

type P = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string;
};

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const rows = (await query(
    "SELECT id, slug, name, description, price, imageUrl FROM products WHERE slug=? LIMIT 1",
    [slug]
  )) as P[];
  if (!rows.length) return <div className="container mx-auto p-6">Ürün bulunamadı</div>;
  const p = rows[0];

  const pct = await activeDiscountPctForSlugServer(slug);
  const { finalPrice, applied } = calcDiscountedUnitPrice(Number(p.price), pct);

  return (
    <main className="container mx-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <img src={p.imageUrl} alt={p.name} className="w-full rounded-xl" />
        <div>
          <h1 className="text-2xl font-semibold mb-2">{p.name}</h1>

          <div className="mb-4">
            {applied ? (
              <div className="flex items-baseline gap-2">
                <span className="text-neutral-400 line-through">{toCurrencyTRY(p.price)}</span>
                <span className="text-emerald-400 font-semibold text-xl">{toCurrencyTRY(finalPrice)}</span>
                <span className="text-sm text-emerald-400">-%{pct}</span>
              </div>
            ) : (
              <span className="text-xl font-semibold">{toCurrencyTRY(p.price)}</span>
            )}
          </div>

          <AddToCart productId={Number(p.id)} unitPrice={Number(finalPrice)} />
        </div>
      </div>
    </main>
  );
}
