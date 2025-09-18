// src/app/products/[slug]/page.js
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { getAttribution, calcDiscountedUnitPrice } from "@/lib/attribution";

function fmtTRY(k){ const n=Number(k||0)/100; return n.toLocaleString("tr-TR",{style:"currency",currency:"TRY",minimumFractionDigits:2,maximumFractionDigits:2}); }
export const dynamic = "force-dynamic";

export default async function ProductDetail(props) {
  const { slug } = await props.params;           // Next 15
  const rows = await query("SELECT id,slug,name,description,price,imageUrl,product_code,isActive FROM products WHERE slug=? LIMIT 1",[slug]);
  if (!rows.length || !rows[0].isActive) return notFound();
  const p = rows[0];

  const attrib = await getAttribution();
  const d = calcDiscountedUnitPrice(p.price, attrib, p.slug);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <img src={p.imageUrl} alt={p.name} className="w-full h-64 object-cover rounded-2xl" />
        <div>
          <h1 className="text-2xl font-semibold mb-2">{p.name}</h1>
          <p className="text-neutral-400 mb-4">{p.description}</p>

          {d.applied ? (
            <>
              <div className="text-sm text-green-400 mb-1">Ref indirimi −{d.discountPct}%</div>
              <div className="text-2xl mb-2">
                <span className="line-through text-neutral-500 mr-3">{fmtTRY(p.price)}</span>
                <span className="font-bold">{fmtTRY(d.finalPrice)}</span>
              </div>
            </>
          ) : (
            <div className="text-2xl mb-2">{fmtTRY(p.price)}</div>
          )}

          <div className="text-sm text-neutral-300 mb-4" id="total-line">Toplam: <b>{fmtTRY(d.finalPrice)}</b></div>

          <form action="/api/cart" method="post" id="add-to-cart-form" className="mt-2">
            <input type="hidden" name="action" value="add" />
            <input type="hidden" name="slug" value={p.slug} />
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm" htmlFor="qty">Adet</label>
              <input id="qty" name="qty" type="number" min="1" defaultValue="1"
                     className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 w-24" />
            </div>
            <button type="submit" className="px-4 py-2 rounded-xl bg-white text-black font-medium hover:opacity-90">
              Sepete ekle
            </button>
          </form>

          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function(){
                  const price=${p.price}; const disc=${d.finalPrice}; const applied=${d.applied?'true':'false'};
                  const qtyEl=document.getElementById('qty'); const line=document.getElementById('total-line');
                  function fmt(v){return (v/100).toLocaleString('tr-TR',{style:'currency',currency:'TRY',minimumFractionDigits:2,maximumFractionDigits:2});}
                  function update(){
                    const q=Math.max(1,parseInt(qtyEl.value||'1',10));
                    if(applied){ line.innerHTML='Toplam: <span class="line-through text-neutral-500 mr-2">'+fmt(price*q)+'</span><b>'+fmt(disc*q)+'</b>'; }
                    else { line.innerHTML='Toplam: <b>'+fmt(price*q)+'</b>'; }
                  }
                  qtyEl.addEventListener('input',update); qtyEl.addEventListener('change',update); update();
                })();
              `,
            }}
          />
        </div>
      </div>
    </main>
  );
}
