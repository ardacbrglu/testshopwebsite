"use client";
import { useEffect, useMemo, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";
import { useRouter } from "next/navigation";
import { emitToast } from "@/components/ToastBus";

function getCart(){ try{ return JSON.parse(localStorage.getItem("cart")||"[]"); }catch{ return []; } }
function setCart(items){ localStorage.setItem("cart", JSON.stringify(items)); }

export default function CartPage() {
  const r = useRouter();
  const [cart, setCartState] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    const c = getCart();
    setCartState(c);
    const ids = c.map(x=>x.productId).join(",");
    const p = ids ? fetch(`/api/products?ids=${ids}`).then(r=>r.json()) : Promise.resolve([]);
    p.then((prods)=>{ setProducts(prods); setLoading(false); });
  },[]);

  const lines = useMemo(()=> cart.map(it=>{
    const p = products.find(x=>x.id===it.productId);
    return p ? { ...p, quantity: it.quantity, line: it.quantity*p.price } : null;
  }).filter(Boolean), [cart, products]);

  const subtotal = lines.reduce((s,l)=>s+l.line,0);

  function setCartBoth(next){ setCart(next); setCartState(next); }
  function updateQty(pid, q){ setCartBoth(cart.map(c=>c.productId===pid?{...c, quantity: Math.max(1,q)}:c)); }
  function remove(pid){ setCartBoth(cart.filter(c=>c.productId!==pid)); }

  async function checkout(){
    const res = await fetch("/api/checkout", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ items: cart })
    });
    const j = await res.json().catch(()=>({}));
    if(!res.ok){ emitToast({ type:"error", title:"Satın alma başarısız", desc:j.error || "Bilinmeyen hata"}); return; }
    setCartBoth([]);
    // Orders sayfasına geçerken toast göstereceğiz (ord query ile)
    r.push(`/orders?ok=1&ord=${encodeURIComponent(j.orderNumber||"")}`);
  }

  if(loading) return <p>Yükleniyor...</p>;

  return (
    <div className="card p-6">
      <h1 className="text-xl font-semibold mb-4">Sepetim</h1>
      {lines.length===0 ? <p>Sepet boş.</p> : (
        <>
          <div className="space-y-3">
            {lines.map(l=>(
              <div key={l.id} className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.imageUrl} alt={l.name} className="w-20 h-16 rounded-lg object-cover" />
                <div className="flex-1">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-sm text-neutral-400">{toCurrencyTRY(l.price)} x {l.quantity}</div>
                </div>
                <input type="number" min={1} className="input w-20" value={l.quantity}
                       onChange={e=>updateQty(l.id, parseInt(e.target.value||"1",10))} />
                <div className="w-28 text-right">{toCurrencyTRY(l.line)}</div>
                <button className="btn" onClick={()=>remove(l.id)}>Sil</button>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-800 mt-6 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span>Ara Toplam</span><span>{toCurrencyTRY(subtotal)}</span>
            </div>
            <div className="flex items-center justify-end pt-2">
              <button className="btn" onClick={checkout}>Satın Al</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
