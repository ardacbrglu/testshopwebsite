"use client";
import { useState } from "react";
import { emitToast } from "@/components/ToastBus";

function getCart() {
  try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; }
}
function setCart(items) {
  localStorage.setItem("cart", JSON.stringify(items));
}

export default function AddToCart({ product, productId, productName, price, compact }) {
  // Güvenli alanlar: hem product hem tekil prop senaryosu desteklenir
  const p = {
    id: product?.id ?? productId ?? null,
    name: product?.name ?? productName ?? null,
    price: product?.price ?? price ?? 0,
  };

  const [qty, setQty] = useState(1);

  function add() {
    if (!p.id) {
      emitToast({ type: "error", title: "Ürün eklenemedi", desc: "Eksik ürün bilgisi." });
      return;
    }

    const cart = getCart();
    const idx = cart.findIndex((x) => x.productId === p.id);
    if (idx > -1) cart[idx].quantity += qty;
    else cart.push({ productId: p.id, quantity: qty });
    setCart(cart);

    // desc yalnızca gerçek bir ad varsa gönderilir
    const payload = { type: "success", title: "Sepete eklendi" };
    if (typeof p.name === "string" && p.name.trim() !== "") {
      payload.desc = `${p.name} × ${qty}`;
    }
    emitToast(payload);
  }

  const onQty = (e) => {
    const v = parseInt(e.target.value || "1", 10);
    setQty(Math.max(1, isNaN(v) ? 1 : v));
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <input type="number" min={1} value={qty} onChange={onQty} className="input w-20" />
        <button className="btn" onClick={add}>Sepete Ekle</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <input type="number" min={1} value={qty} onChange={onQty} className="input w-24" />
      <button className="btn" onClick={add}>Sepete Ekle</button>
    </div>
  );
}
