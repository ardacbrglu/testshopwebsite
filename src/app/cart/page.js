"use client";

import { useEffect, useMemo, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";
import { useRouter } from "next/navigation";

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
    if(ids){
      fetch(`/api/products?ids=${ids}`).then(r=>r.json()).then(setProducts).finally(()=>setLoading(false));
    } else { setProducts([]); setLoading(false); }
  },[]);

  const lines = useMemo(()=> cart.map(it=>{
    const p = products.find(x=>x.id===it.productId);
    return p ? { ...p, quantity: it.quantity, line: it.quantity*p.price } : null;
  }).filter(Boolean), [cart, products]);

  const total = lines.reduce((s,l)=>s+l.line,0);

  function setCartBoth(next){ setCart(next); setCartState(next); }
  function updateQty(pid, q){ setCartBoth(cart.map(c=>c.productId===pid?{...c, quantity: Math.max(1,q)}:c)); }
  function remove(pid){ setCartBoth(cart.filter(c=>c.productId!==pid)); }

  async function checkout(){
    const res = await fetch("/api/checkout", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ items: cart })
    });
    if(!res.ok){ const j = await res.json().catch(()=>({error:"Hata"})); alert(j.error||"Hata"); return; }
    const j = await res.json();
    setCartBoth([]);
    alert(`Sipariş alındı! Order #: ${j.orderNumber}`);
    r.push("/orders");
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
          <div className="border-t border-neutral-800 mt-6 pt-4 flex items-center justify-between">
            <div className="text-lg font-semibold">Toplam: {toCurrencyTRY(total)}</div>
            <button className="btn" onClick={checkout}>Satın Al</button>
          </div>
        </>
      )}
    </div>
  );
}
