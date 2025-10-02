"use client";
import { useEffect, useState } from "react";
import type { ApiCartItem, ApiOrder } from "@/lib/types";
import CartLine from "@/components/CartLine";
import { formatTRY } from "@/lib/money";
import { useToast } from "@/components/Toast";

type CartResp = {
  cartId: string;
  email?: string | null;
  items: ApiCartItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  referral?: unknown;
};

export default function CartPage() {
  const [data, setData] = useState<CartResp | null>(null);
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const { show } = useToast();

  async function refresh() {
    const r = await fetch("/api/cart", { cache: "no-store" });
    const j: CartResp = await r.json();
    setData(j);
    setEmail(j.email || "");
  }
  useEffect(() => { refresh(); }, []);

  async function setQty(productId: number, q: number) {
    await fetch("/api/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, quantity: q }),
    });
    refresh();
  }
  async function remove(productId: number) {
    await fetch(`/api/cart?productId=${productId}`, { method: "DELETE" });
    refresh();
  }
  async function saveEmail() {
    const r = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (r.ok) { show({ type: "success", title: "E-posta kaydedildi" }); setOrders(null); refresh(); }
    else {
      let j: unknown = {}; try { j = await r.json(); } catch {}
      const msg = (j as { error?: string })?.error || "E-posta geçersiz";
      show({ type: "error", title: msg });
    }
  }
  async function checkout() {
    const r = await fetch("/api/checkout", { method: "POST" });
    let j: unknown = null; try { j = await r.json(); } catch {}
    const err = (j as { error?: string })?.error;
    if (r.ok) { show({ type: "success", title: "Satın alma tamamlandı" }); setOrders(null); refresh(); }
    else if (err === "EMAIL_REQUIRED") show({ type: "error", title: "Önce e-posta girin" });
    else if (err === "CART_EMPTY") show({ type: "error", title: "Sepet boş" });
    else show({ type: "error", title: "İşlem başarısız" });
  }
  async function loadOrders() {
    setLoadingOrders(true);
    setOrders(null);
    const r = await fetch("/api/orders", { cache: "no-store" });
    let j: unknown = {}; try { j = await r.json(); } catch {}
    setLoadingOrders(false);
    if (r.ok) {
      const arr = (j as { orders?: ApiOrder[] }).orders || [];
      setOrders(arr);
      if (!arr.length) show({ type: "info", title: "Kayıtlı sipariş bulunamadı" });
    } else {
      const err = (j as { error?: string })?.error;
      if (err === "EMAIL_REQUIRED") show({ type: "error", title: "Önce e-posta kaydedin" });
      else show({ type: "error", title: "Geçmiş alınamadı" });
    }
  }

  if (!data) return <div className="p-6">Yükleniyor…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Sepetim</h1>

      <div className="card">
        {data.items.length === 0 ? (
          <div className="p-6 text-neutral-400">Sepetiniz boş.</div>
        ) : (
          <div className="p-3">
            {data.items.map((it) => (
              <CartLine
                key={it.productId}
                item={it}
                onQuantityChange={(q) => setQty(it.productId, q)}
                onRemove={() => remove(it.productId)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Alışveriş e-postası</div>
          <div className="flex gap-2 mt-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="eposta@ornek.com"
              className="input"
            />
            <button onClick={saveEmail} className="btn">Kaydet</button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <button onClick={loadOrders} className="btn">
              {loadingOrders ? "Yükleniyor..." : "Satın alım geçmişini göster"}
            </button>
            {!data.email && (
              <span className="text-xs text-neutral-500">
                (Geçmiş için önce e-posta kaydedin)
              </span>
            )}
          </div>

          <div className="text-xs text-neutral-500 mt-2">
            Satın alımlar bu e-posta ile ilişkilendirilecektir.
          </div>
        </div>

        <div className="card p-4">
          <div className="flex justify-between text-sm">
            <div>Ara toplam</div>
            <div>{formatTRY(data.subtotalCents)}</div>
          </div>
          <div className="flex justify-between text-sm text-emerald-400 mt-1">
            <div>İndirim</div>
            <div>-{formatTRY(data.discountCents)}</div>
          </div>
          <div className="flex justify-between text-lg font-semibold mt-3">
            <div>Toplam</div>
            <div>{formatTRY(data.totalCents)}</div>
          </div>
          <button onClick={checkout} className="w-full mt-4 btn">Satın al</button>
        </div>
      </div>

      {orders && (
        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-2">Satın Alım Geçmişi</h2>
          {orders.length > 0 ? (
            <div className="space-y-4">
              {orders.map((o) => (
                <div key={o.id} className="rounded-lg border border-neutral-800 p-3">
                  <div className="flex justify-between text-sm">
                    <div>#{o.id} · {new Date(o.createdAt).toLocaleString("tr-TR")}</div>
                    <div className="font-medium">{formatTRY(o.totalCents)}</div>
                  </div>
                  <div className="mt-2 text-sm text-neutral-400 space-y-1">
                    {o.items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={it.imageUrl || ""} alt="" className="w-10 h-10 object-cover rounded" />
                        <div className="flex-1">{it.name} × {it.quantity}</div>
                        <div>{formatTRY(it.lineFinalCents)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-neutral-400 text-sm">Kayıtlı sipariş bulunamadı.</div>
          )}
        </div>
      )}
    </div>
  );
}
