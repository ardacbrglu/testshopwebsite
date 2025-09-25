/* eslint-disable @next/next/no-img-element */
import { query } from "@/lib/db";
import { calcDiscountedUnitPrice, getDiscountPctForSlug } from "@/lib/attribution";

export default async function ProductPage({ params }) {
  const slug = params.slug;
  const rows = await query("SELECT id, name, price, imageUrl FROM products WHERE slug=? LIMIT 1", [slug]);
  if (!rows.length) return <div>Ürün bulunamadı</div>;
  const p = rows[0];

  const unit = Number(p.price);
  const d = calcDiscountedUnitPrice(unit, slug, {}); // SSR ön-hesap
  const hasDiscount = d.applied;
  const pct = hasDiscount ? getDiscountPctForSlug(slug) : 0;

  return (
    <div className="container mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <img src={p.imageUrl} alt={p.name} className="w-full rounded-xl" />
        <div>
          <h1 className="text-2xl font-semibold mb-2">{p.name}</h1>

          <div className="mb-4">
            {hasDiscount ? (
              <div className="flex items-baseline gap-2">
                <span id="price-old" className="text-gray-500 line-through">
                  ₺{(unit/100).toFixed(2)}
                </span>
                <span id="price-now" className="text-red-600 font-bold text-xl">
                  ₺{(d.finalPrice/100).toFixed(2)}
                </span>
                <span className="text-sm text-green-600">-%{pct}</span>
              </div>
            ) : (
              <span id="price-now" className="text-xl font-bold">₺{(unit/100).toFixed(2)}</span>
            )}
          </div>

          <form method="post" action="/api/cart" className="space-y-3" id="addForm">
            <input type="hidden" name="action" value="add" />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="wid" id="caboWid" value="" />
            <label className="block">
              Adet:
              <input type="number" min={1} defaultValue={1} name="qty" id="qty"
                     className="border rounded px-2 py-1 ml-2 w-20" />
            </label>

            <div className="text-sm text-gray-600">
              Toplam: <b id="total">₺{(d.finalPrice/100).toFixed(2)}</b>
            </div>

            <button className="px-4 py-2 bg-blue-600 text-white rounded">Sepete Ekle</button>
          </form>

          <script dangerouslySetInnerHTML={{ __html: `
            (function(){
              try{
                var wid = sessionStorage.getItem('cabo_wid');
                var widInput = document.getElementById('caboWid');
                if (wid && widInput) widInput.value = wid;

                var qtyEl = document.getElementById('qty');
                var totalEl = document.getElementById('total');
                var finalUnit = ${d.finalPrice};

                function update(){
                  var q = parseInt(qtyEl.value || "1", 10); if (q<1) q=1;
                  var t = finalUnit * q;
                  totalEl.textContent = "₺" + (t/100).toFixed(2);
                }
                qtyEl.addEventListener('input', update);
                update();
              }catch(e){}
            })();
          `}} />
        </div>
      </div>
    </div>
  );
}
