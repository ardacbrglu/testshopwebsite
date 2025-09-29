// src/app/products/page.tsx
/* eslint-disable @next/next/no-img-element */
import { query } from "@/lib/db";
import { toCurrencyTRY } from "@/lib/format";
import { activeDiscountPctForSlugServer, calcDiscountedUnitPrice } from "@/lib/attribution";
import AddToCart from "@/components/AddToCart";

type PRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string;
};

async function getProducts(): Promise<PRow[]> {
  const rows = await query(
    "SELECT id, slug, name, description, price, imageUrl FROM products WHERE isActive=1 ORDER BY id ASC"
  );
  return rows as PRow[];
}

export default async function ProductsPage() {
  const products = await getProducts();
  const pcts = await Promise.all(products.map((p) => activeDiscountPctForSlugServer(p.slug)));

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Ürünler</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((p, i) => {
          const pct = pcts[i] ?? 0;
          const { finalPrice, applied } = calcDiscountedUnitPrice(Number(p.price), pct);
          return (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-neutral-900/60 p-4 shadow">
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-4 bg-neutral-800">
                <img src={p.imageUrl} alt={p.name} className="object-cover w-full h-full" />
              </div>
              <div className="text-sm text-neutral-400">{p.slug}</div>
              <div className="text-lg font-medium">{p.name}</div>
              {p.description ? (
                <div className="text-neutral-300 text-sm mt-1 line-clamp-2">{p.description}</div>
              ) : null}

              <div className="mt-2">
                {applied ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-neutral-400 line-through">{toCurrencyTRY(p.price)}</span>
                    <span className="text-emerald-400 font-semibold">{toCurrencyTRY(finalPrice)}</span>
                    <span className="text-xs text-emerald-400">-%{pct}</span>
                  </div>
                ) : (
                  <div className="font-semibold">{toCurrencyTRY(p.price)}</div>
                )}
              </div>

              <AddToCart productId={Number(p.id)} unitPrice={Number(finalPrice)} />
            </div>
          );
        })}
      </div>
    </main>
  );
}
