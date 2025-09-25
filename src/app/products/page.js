/* eslint-disable @next/next/no-img-element */
import { query } from "@/lib/db";
import { calcDiscountedUnitPrice, getDiscountPctForSlug } from "@/lib/attribution";

export default async function ProductsPage() {
  const rows = await query(
    "SELECT id, slug, name, price, imageUrl FROM products WHERE isActive=1 ORDER BY id DESC LIMIT 50"
  );

  return (
    <div className="container mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
      {rows.map((p) => {
        const unit = Number(p.price);
        const d = calcDiscountedUnitPrice(unit, p.slug, {});
        const hasDiscount = d.applied;
        const pct = hasDiscount ? getDiscountPctForSlug(p.slug) : 0;

        return (
          <div key={p.id} className="border rounded-xl p-3">
            <img src={p.imageUrl} alt={p.name} className="w-full rounded-lg mb-2" />
            <div className="font-medium">{p.name}</div>
            <div className="mb-2">
              {hasDiscount ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-gray-500 line-through">₺{(unit/100).toFixed(2)}</span>
                  <span className="text-red-600 font-bold">₺{(d.finalPrice/100).toFixed(2)}</span>
                  <span className="text-sm text-green-600">-%{pct}</span>
                </div>
              ) : (
                <span className="font-semibold">₺{(unit/100).toFixed(2)}</span>
              )}
            </div>

            <form method="post" action="/api/cart" className="flex items-center gap-2">
              <input type="hidden" name="action" value="add" />
              <input type="hidden" name="slug" value={p.slug} />
              <input type="hidden" name="wid" className="caboWid" value="" />
              <input type="number" min={1} defaultValue={1} name="qty" className="border rounded px-2 py-1 w-20" />
              <a href={`/products/${p.slug}`} className="px-3 py-2 bg-gray-100 rounded">Gör</a>
              <button className="px-3 py-2 bg-blue-600 text-white rounded">Sepete Ekle</button>
            </form>
          </div>
        );
      })}

      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          try{
            var wid = sessionStorage.getItem('cabo_wid');
            document.querySelectorAll('input.caboWid').forEach(function(el){ if (wid) el.value = wid; });
          }catch(e){}
        })();
      `}} />
    </div>
  );
}
