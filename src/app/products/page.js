// src/app/products/page.js
import { query } from "@/lib/db";
import { getAttribution, calcDiscountedUnitPrice } from "@/lib/attribution";
import Link from "next/link";

function fmtTRY(kurus) {
  const n = Number(kurus || 0) / 100;
  return n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await query(
    "SELECT id, slug, name, description, price, imageUrl, isActive FROM products WHERE isActive=1 ORDER BY createdAt DESC"
  );
  const attrib = await getAttribution(); // ⬅️ async

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Products</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {products.map((p) => {
          const d = calcDiscountedUnitPrice(p.price, attrib, p.slug);
          return (
            <div key={p.id} className="rounded-2xl shadow p-4 bg-neutral-900 border border-neutral-800">
              <img src={p.imageUrl} alt={p.name} className="w-full h-40 object-cover rounded-xl mb-3" />
              <h2 className="text-lg font-medium">{p.name}</h2>
              <p className="text-sm text-neutral-400 line-clamp-2 mb-3">{p.description}</p>

              {d.applied ? (
                <div className="mb-3">
                  <div className="text-sm text-green-400">Ref indirimi −{d.discountPct}%</div>
                  <div className="text-lg">
                    <span className="line-through text-neutral-500 mr-2">{fmtTRY(p.price)}</span>
                    <span className="font-semibold">{fmtTRY(d.finalPrice)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-lg mb-3">{fmtTRY(p.price)}</div>
              )}

              <div className="flex gap-2">
                <Link className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm" href={`/products/${p.slug}`}>
                  View
                </Link>
                <form action={`/api/checkout`} method="post" className="ml-auto">
                  <input type="hidden" name="slug" value={p.slug} />
                  <input type="hidden" name="qty" value="1" />
                  <button className="px-3 py-2 rounded-xl bg-white text-black text-sm hover:opacity-90" type="submit">
                    Buy now
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
