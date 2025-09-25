/* eslint-disable @next/next/no-img-element */
import { query } from "@/lib/db";
import { toCurrencyTRY } from "@/lib/format";
import AddToCart from "@/components/AddToCart";
import { activeDiscountPctForSlugServer } from "@/lib/attribution";

interface ProductRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string;
}

async function getProduct(slug: string): Promise<ProductRow | null> {
  const rows = (await query(
    "SELECT id, slug, name, description, price, imageUrl FROM products WHERE slug = ? LIMIT 1",
    [slug]
  )) as unknown as ProductRow[];
  return rows[0] ?? null;
}

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const p = await getProduct(params.slug);
  if (!p) return <div className="p-6">Ürün bulunamadı.</div>;

  const pct = await activeDiscountPctForSlugServer(p.slug);
  const discounted = pct > 0 ? p.price - Math.round(p.price * (pct / 100)) : p.price;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl overflow-hidden bg-neutral-800 aspect-[4/3]">
          <img src={p.imageUrl} alt={p.name} className="object-cover w-full h-full" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold mb-2">{p.name}</h1>

          <div className="mb-3">
            {pct > 0 ? (
              <div className="flex items-baseline gap-2">
                <span className="text-neutral-400 line-through">{toCurrencyTRY(p.price)}</span>
                <span className="font-semibold text-xl">{toCurrencyTRY(discounted)}</span>
                <span className="text-emerald-400 text-sm">-%{pct}</span>
              </div>
            ) : (
              <span className="text-xl font-semibold">{toCurrencyTRY(p.price)}</span>
            )}
          </div>

          {p.description && <p className="text-neutral-300 mb-4">{p.description}</p>}

          <AddToCart productId={p.id} unitPrice={p.price} discountPct={pct} />
        </div>
      </div>
    </main>
  );
}
