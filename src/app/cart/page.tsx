"use client";

import { useEffect, useMemo, useState } from "react";
import CartLine from "@/components/CartLine";
import { formatTRY } from "@/lib/money";
import type { ApiCartItem } from "@/lib/types";
import { useToast } from "@/components/Toast";

type CartResponse = {
  cartId: string;
  email: string | null;
  items: ApiCartItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  referral: any | null;
};

export default function CartPage() {
  const { show } = useToast();

  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartResponse | null>(null);

  const [email, setEmail] = useState("");
  const canCheckout = useMemo(() => !!(cart?.items?.length && email.trim()), [cart, email]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/cart", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "CART_LOAD_FAILED");
      setCart(j);
      setEmail(j?.email || "");
    } catch (e: any) {
      show({ type: "error", title: "Sepet yüklenemedi" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateQty(productId: number, next: number) {
    try {
      const r = await fetch("/api/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: next }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "QTY_UPDATE_FAILED");
      setCart(j);
    } catch {
      show({ type: "error", title: "Adet güncellenemedi" });
    }
  }

  async function removeItem(productId: number) {
    try {
      const r = await fetch(`/api/cart?productId=${productId}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "REMOVE_FAILED");
      setCart(j);
    } catch {
      show({ type: "error", title: "Ürün kaldırılamadı" });
    }
  }

  async function saveEmail() {
    try {
      // Eğer senin sisteminde email kaydı başka endpoint ise söyle, ona göre düzeltirim.
      // Şu projede email genelde cart page içinde /api/email gibi bir route ile olur.
      const r = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "EMAIL_SAVE_FAILED");
      show({ type: "success", title: "E-posta kaydedildi" });
      await load();
    } catch {
      show({ type: "error", title: "E-posta kaydedilemedi" });
    }
  }

  async function checkout() {
    try {
      const r = await fetch("/api/checkout", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "CHECKOUT_FAILED");
      show({ type: "success", title: "Satın alındı" });
      await load();
    } catch {
      show({ type: "error", title: "Satın alma başarısız" });
    }
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6 text-neutral-300">Yükleniyor…</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-semibold mb-6">Sepetim</h1>

      <div className="space-y-4">
        {(cart?.items || []).map((it) => (
          <CartLine
            key={it.productId}
            item={it}
            onQuantityChange={(n) => updateQty(it.productId, n)}
            onRemove={() => removeItem(it.productId)}
          />
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <div className="card p-5">
          <div className="text-neutral-400 mb-2">Alışveriş e-postası</div>
          <div className="flex gap-3">
            <input
              className="flex-1 rounded-xl border border-neutral-700 bg-black px-4 py-2 outline-none"
              placeholder="eposta@ornek.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn" onClick={saveEmail}>
              Kaydet
            </button>
          </div>
          <div className="text-neutral-500 text-sm mt-3">
            Satın alımlar bu e-posta ile ilişkilendirilecektir.
          </div>
        </div>

        <div className="card p-5">
          <div className="flex justify-between text-lg">
            <span className="text-neutral-300">Ara toplam</span>
            <span>{formatTRY(cart?.subtotalCents || 0)}</span>
          </div>

          <div className="flex justify-between text-lg mt-2">
            <span className="text-emerald-400">İndirim</span>
            <span className="text-emerald-400">-{formatTRY(cart?.discountCents || 0)}</span>
          </div>

          <div className="flex justify-between text-2xl font-bold mt-4">
            <span>Toplam</span>
            <span>{formatTRY(cart?.totalCents || 0)}</span>
          </div>

          <button className="btn w-full mt-5" onClick={checkout} disabled={!canCheckout}>
            Satın al
          </button>
        </div>
      </div>
    </div>
  );
}
