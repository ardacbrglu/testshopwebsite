// src/app/products/[slug]/page.js
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { getAttribution, calcDiscountedUnitPrice } from "@/lib/attribution";
import { toPriceTextTRY } from "@/lib/currency";

export const dynamic = "force-dynamic";

export default async function ProductDetail({ params }) {
  const slug = params.slug;
  const rows = await query(
    "SELECT id, slug, name, description, price, imageUrl, product_code, isActive FROM products WHERE slug=? LIMIT 1",
    [slug]
  );
  if (!rows.length || !rows[0].isActive) return notFound();

  const p = rows[0];
  const attrib = getAttribution();
  const d = calcDiscountedUnitPrice(p.price, attrib, p.slug);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <img src={p.imageUrl} alt={p.name} className="w-full h-64 object-cover rounded-2xl" />
        <div>
          <h1 className="text-2xl font-semibold mb-2">{p.name}</h1>
          <p className="text-neutral-400 mb-6">{p.description}</p>

          {d.applied ? (
            <>
              <div className="text-sm text-green-400 mb-1">Ref indirimi −{d.discountPct}%</div>
              <div className="text-2xl mb-4">
                <span className="line-through text-neutral-500 mr-3">{toPriceTextTRY(p.price)}</span>
                <span className="font-bold">{toPriceTextTRY(d.finalPrice)}</span>
              </div>
            </>
          ) : (
            <div className="text-2xl mb-4">{toPriceTextTRY(p.price)}</div>
          )}

          <form action={`/api/checkout`} method="post">
            <input type="hidden" name="slug" value={p.slug} />
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm">Adet</label>
              <input
                name="qty"
                type="number"
                min="1"
                defaultValue="1"
                className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 w-24"
              />
            </div>
            <button type="submit" className="px-4 py-2 rounded-xl bg-white text-black font-medium hover:opacity-90">
              Satın al
            </button>
          </form>

          {!attrib && (
            <p className="text-xs text-neutral-500 mt-4">
              * İndirim sadece Cabo referans linki ile geldiğinizde uygulanır.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
