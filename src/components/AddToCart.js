"use client";
import { useEffect, useState } from "react";

function getCart(){ try{ return JSON.parse(localStorage.getItem("cart")||"[]"); } catch{ return []; } }
function setCart(items){ localStorage.setItem("cart", JSON.stringify(items)); }

export default function AddToCart({ productId }) {
  const [qty, setQty] = useState(1);
  useEffect(()=>{ if(qty<1) setQty(1); },[qty]);

  function add(){
    const cur = getCart();
    const i = cur.findIndex(x=>x.productId===productId);
    if(i>=0) cur[i].quantity += qty; else cur.push({ productId, quantity: qty });
    setCart(cur);
    alert("Sepete eklendi.");
  }

  return (
    <div className="flex items-center gap-2">
      <input type="number" min={1} value={qty} onChange={e=>setQty(parseInt(e.target.value||"1",10))} className="input w-20 text-center" />
      <button onClick={add} className="btn">Sepete Ekle</button>
    </div>
  );
}
