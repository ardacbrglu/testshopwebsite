"use client";
import { useEffect, useMemo, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";
import { applyPercentDiscount } from "@/lib/discount";

function readCart(){ try{ return JSON.parse(localStorage.getItem("cart")||"[]"); }catch{ return []; } }
function writeCart(v){ localStorage.setItem("cart", JSON.stringify(v)); }

export default function CartPage(){
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const discountMap = useMemo(() => {
    try {
      return JSON.parse(
        process.env.NEXT_PUBLIC_CABO_DISCOUNTS_JSON ||
        process.env.CABO_DISCOUNTS_JSON || "{}"
      );
    } catch { return {}; }
  }, []);

  useEffect(()=>{
    const c = readCart();
    setCart(c);
    const ids = c.map(x=>x.productId).join(",");
    const p = ids ? fetch(`/api/products?ids=${ids}`).then(r=>r.json()) : Promise.resolve([]);
    p.then(setProducts).finally(()=>setLoading(false));
  },[]);

  const lines = useMemo(()=> {
    return cart.map(ci => {
      const p = products.find(pp=>pp.id===ci.productId);
      if (!p) return null;
      const rule = discountMap[p.slug] || discountMap[p.id] || discountMap[ci.productSlug] || null;
      const { price: unitPrice, pct } = applyPercentDiscount(p.price, rule);
      const line = +(unitPrice * ci.quantity).toFixed(2);
      return { ...p, quantity: ci.quantity, unitPrice, line, pct };
    }).filter(Boolean);
  }, [cart, products, discountMap]);

  const subtotal = useMemo(()=> lines.reduce((s,l)=>s+l.line,0), [lines]);

  function updateQty(pid, q){
    const next = cart.map(c=>c.productId===pid ? {...c, quantity: Math.max(1,q)} : c);
    writeCart(next); setCart(next);
  }
  function remove(pid){
    const next = cart.filter(c=>c.productId!==pid);
    writeCart(next); setCart(next);
  }

  async function checkout(){
    const caboRef = localStorage.getItem("caboRef") || null;
    const caboLid = localStorage.getItem("caboLid") || null;

    // İndirimli satırları backend'e gönder (checkout API)
    const items = lines.map(l => ({
      productId: l.id,
      productSlug: l.slug,
      quantity: l.quantity,
      unitPriceCharged: l.unitPrice,
      lineTotal: l.line
    }));

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ caboRef, caboLid, items })
    });
    const j = await res.json().catch(()=>({}));
    if(!res.ok || j?.ok === false){
      alert(j?.error || "Satın alma başarısız");
      return;
    }

    writeCart([]); setCart([]);
    window.location.href = `/orders?ok=1&ord=${encodeURIComponent(j.orderNumber||"")}`;
  }

  if (loading) return <div className="p-6">Yükleniyor…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Sepetim</h1>
      {lines.length===0 ? <p>Sepet boş.</p> : (
        <>
          <div className="space-y-3">
            {lines.map(l=>(
              <div key={l.id} className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.imageUrl} alt={l.name} className="w-20 h-16 rounded-lg object-cover"/>
                <div className="flex-1">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-sm text-neutral-400">
                    {l.pct!=null ? (
                      <>
                        <span className="line-through mr-2">{toCurrencyTRY(l.price)}</span>
                        <b>{toCurrencyTRY(l.unitPrice)}</b> <span className="text-green-400">(-%{l.pct})</span>
                      </>
                    ) : (
                      <b>{toCurrencyTRY(l.price)}</b>
                    )}
                    {" "}× {l.quantity}
                  </div>
                </div>
                <input type="number" min={1} className="input w-20"
                       value={l.quantity}
                       onChange={e=>updateQty(l.id, parseInt(e.target.value||"1",10))}/>
                <div className="w-28 text-right">{toCurrencyTRY(l.line)}</div>
                <button className="btn" onClick={()=>remove(l.id)}>Sil</button>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-800 mt-6 pt-4 flex items-center justify-between">
            <span>Ara Toplam</span>
            <span className="font-bold">{toCurrencyTRY(subtotal)}</span>
          </div>

          <div className="flex justify-end pt-3">
            <button className="btn" onClick={checkout}>Satın Al</button>
          </div>
        </>
      )}
    </div>
  );
}
