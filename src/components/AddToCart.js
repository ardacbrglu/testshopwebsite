"use client";
import { useState } from "react";
import { emitToast } from "@/components/ToastBus";

function getCart() {
  try {
    return JSON.parse(localStorage.getItem("cart") || "[]");
  } catch {
    return [];
  }
}
function setCart(items) {
  localStorage.setItem("cart", JSON.stringify(items));
}

export default function AddToCart({ product, productId, productName, price, compact }) {
  // p tamamen JS objesi; TS tipleri YOK
  const p = product || { id: productId, name: productName, price };
  const [qty, setQty] = useState(1);

  function add() {
    const cart = getCart();
    const idx = cart.findIndex((x) => x.productId === p.id);
    if (idx > -1) cart[idx].quantity += qty;
    else cart.push({ productId: p.id, quantity: qty });
    setCart(cart);

    emitToast({ type: "success", title: "Sepete eklendi", desc: `${p.name} × ${qty}` });
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
          className="input w-20"
        />
        <button className="btn" onClick={add}>Sepete Ekle</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
        className="input w-24"
      />
      <button className="btn" onClick={add}>Sepete Ekle</button>
    </div>
  );
}
