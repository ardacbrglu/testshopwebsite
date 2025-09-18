// src/app/cart/page.tsx
import { query } from "@/lib/db";
import { getCartIdOptional } from "@/lib/cart";
import { getAttribution, calcDiscountedUnitPrice } from "@/lib/attribution";

type Row = { cart_item_id:number; product_id:number; slug:string; name:string; price:number; imageUrl:string; quantity:number; };
function fmtTRY(k:number){ const n=Number(k||0)/100; return n.toLocaleString("tr-TR",{style:"currency",currency:"TRY",minimumFractionDigits:2,maximumFractionDigits:2}); }
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cartId = await getCartIdOptional();
  let items: Row[] = [];
  let email: string | null = null;

  if (cartId) {
    items = (await query(
      `SELECT ci.id as cart_item_id, ci.product_id, p.slug, p.name, p.price, p.imageUrl, ci.quantity
       FROM cart_items ci JOIN products p ON p.id=ci.product_id
       WHERE ci.cart_id=? ORDER BY ci.id DESC`, [cartId]
    )) as Row[];
    const r = await query("SELECT email FROM carts WHERE id=? LIMIT 1", [cartId]);
    email = (r[0]?.email as string) || null;
  }

  const attrib = await getAttribution();
  let sub=0, subAfter=0, discTotal=0;
  const hydrated = items.map(it=>{
    const d = calcDiscountedUnitPrice(it.price, attrib, it.slug);
    const line = it.price*it.quantity, after = d.finalPrice*it.quantity;
    sub += line; subAfter += after; discTotal += (line-after);
    return {...it, unit_after:d.finalPrice, pct:d.discountPct};
  });

  const canCheckout = !!email && hydrated.length>0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">Sepet</h1>

      {hydrated.length===0 ? <p>Sepet boş.</p> : (
        <div className="space-y-4">
          {hydrated.map(it=>(
            <div key={it.cart_item_id} className="flex items-center gap-3 border border-neutral-800 rounded-xl p-3">
              <img src={it.imageUrl} className="w-16 h-16 object-cover rounded-lg" alt="" />
              <div className="flex-1">
                <div className="font-medium">{it.name}</div>
                <div className="text-sm text-neutral-400">{it.slug}</div>
                {it.pct>0 ? (
                  <div className="text-sm">
                    <span className="text-green-400">−{it.pct}%</span>{" "}
                    <span className="line-through text-neutral-500 mr-1">{fmtTRY(it.price)}</span>
                    <b>{fmtTRY(it.unit_after)}</b>
                  </div>
                ) : <div className="text-sm">{fmtTRY(it.price)}</div>}
              </div>

              <form action="/api/cart" method="post" className="flex items-center gap-2">
                <input type="hidden" name="action" value="update" />
                <input type="hidden" name="cart_item_id" value={it.cart_item_id} />
                <input name="qty" type="number" min={1} defaultValue={it.quantity}
                       className="bg-neutral-900 border border-neutral-800 rounded-xl px-2 py-1 w-20" />
                <button className="text-sm px-2 py-1 rounded bg-neutral-800">Güncelle</button>
              </form>

              <form action="/api/cart" method="post">
                <input type="hidden" name="action" value="remove" />
                <input type="hidden" name="cart_item_id" value={it.cart_item_id} />
                <button className="text-sm px-2 py-1 rounded bg-red-600">Sil</button>
              </form>
            </div>
          ))}

          <div className="border border-neutral-800 rounded-xl p-4">
            <div className="flex justify-between"><span>Ara toplam</span><b>{fmtTRY(sub)}</b></div>
            {discTotal>0 && <div className="flex justify-between text-green-400"><span>İndirim</span><b>−{fmtTRY(discTotal)}</b></div>}
            <div className="flex justify-between mt-1 text-lg"><span>Genel toplam</span><b>{fmtTRY(subAfter)}</b></div>
          </div>

          <div className="border border-neutral-800 rounded-xl p-4 space-y-3">
            <form action="/api/cart" method="post" className="flex items-center gap-3">
              <input type="hidden" name="action" value="set-email" />
              <input name="email" type="email" placeholder="E-posta adresiniz"
                     defaultValue={email || ""} className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 flex-1" />
              <button className="px-3 py-2 rounded-xl bg-neutral-800">Kaydet</button>
            </form>

            <form action="/api/checkout" method="post">
              <input type="hidden" name="fromCart" value="1" />
              <button className={`px-4 py-2 rounded-xl ${canCheckout?'bg-white text-black':'bg-neutral-800 text-neutral-500 cursor-not-allowed'}`} disabled={!canCheckout}>
                Satın al
              </button>
            </form>
            {!email && <p className="text-sm text-yellow-400">Satın almak için önce e-posta girin.</p>}
          </div>
        </div>
      )}
    </main>
  );
}
