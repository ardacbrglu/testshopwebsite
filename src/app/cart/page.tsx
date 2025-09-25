"use client";

import { useEffect, useState } from "react";
import { toCurrencyTRY } from "@/lib/format";

type CartItem = {
  id: number;
  productId: number;
  quantity: number;
  name: string;
  slug: string;
  price: number; // kuruş
  imageUrl: string;
  // opsiyonel, eğer API GET /api/cart indirim pct dönüyorsa gösterebilirsin
  discountPct?: number;
  unitAfter?: number;
};

type WebhookReport = {
  attempted: boolean;
  sent: boolean;
  items: number;
  reason?: string;
  status?: number;
  responseText?: string;
  url?: string;
};

type CheckoutResponse = {
  ok: boolean;
  orderNumber: string;
  orderId: number;
  total: number;
  caboRef: string | null;
  lid: string | null;
  webhook?: WebhookReport;
};

export default function CartPage() {
  const [email, setEmail] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [log, setLog] = useState<WebhookReport | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);

  const total = items.reduce(
    (acc, it) => acc + Number(it.price) * Number(it.quantity),
    0
  );

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      const j = await res.json();
      setEmail(j?.email ?? "");
      setItems(j?.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveEmail() {
    const res = await fetch("/api/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error || "E-posta kaydedilemedi");
    }
  }

  async function updateQty(itemId: number, quantity: number) {
    const res = await fetch("/api/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ itemId, quantity }),
    });
    if (res.ok) load();
  }

  async function removeItem(itemId: number) {
    const res = await fetch("/api/cart", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ itemId }),
    });
    if (res.ok) load();
  }

  async function checkout() {
    setLog(null);
    setOrderNo(null);

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ email }),
    });

    const j = (await res.json().catch(() => ({}))) as CheckoutResponse;
    if (!res.ok || !j?.ok) {
      alert((j as any)?.error || "Checkout başarısız");
      return;
    }

    // Sipariş no + webhook raporu
    setOrderNo(j.orderNumber || null);
    setLog(j.webhook ?? null);

    // sepet boşalır
    load();
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Sepetim</h1>

      <div className="flex items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-posta adresinizi girin (zorunlu)"
          className="w-[360px] max-w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm"
        />
        <button
          onClick={saveEmail}
          className="rounded-xl px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 transition"
        >
          E-postayı Kaydet
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {loading && <div className="text-neutral-400">Yükleniyor…</div>}
        {!loading && items.length === 0 && (
          <div className="text-neutral-400">Sepetiniz boş.</div>
        )}
        {items.map((it) => {
          const lineTotal = Number(it.price) * Number(it.quantity);
          const hasDisc = typeof it.unitAfter === "number" && it.unitAfter! < it.price;
          const lineAfter =
            hasDisc ? Number(it.unitAfter) * Number(it.quantity) : lineTotal;

          return (
            <div
              key={it.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-neutral-900/60 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <img
                  src={it.imageUrl}
                  alt={it.name}
                  className="w-12 h-12 object-cover rounded"
                />
                <div>
                  <div className="text-sm text-neutral-400">{it.slug}</div>
                  <div className="font-medium">{it.name}</div>
                  <div className="text-xs text-neutral-400">
                    Birim:{" "}
                    {hasDisc ? (
                      <>
                        <span className="line-through mr-2">
                          {toCurrencyTRY(it.price)}
                        </span>
                        <b className="text-emerald-400">
                          {toCurrencyTRY(it.unitAfter!)}
                        </b>
                      </>
                    ) : (
                      <b>{toCurrencyTRY(it.price)}</b>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) =>
                    updateQty(it.id, Math.max(1, Number(e.target.value || 1)))
                  }
                  className="w-16 bg-neutral-800 rounded px-2 py-1 text-center outline-none"
                />
                <button
                  onClick={() => updateQty(it.id, it.quantity)}
                  className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-sm"
                >
                  Güncelle
                </button>
                <button
                  onClick={() => removeItem(it.id)}
                  className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-sm"
                >
                  Kaldır
                </button>
              </div>

              <div className="text-sm">
                Toplam:{" "}
                <b>
                  {hasDisc
                    ? toCurrencyTRY(lineAfter)
                    : toCurrencyTRY(lineTotal)}
                </b>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-lg">
          Genel Toplam: <b>{toCurrencyTRY(total)}</b>
        </div>
        <button
          onClick={checkout}
          className="rounded-xl px-4 py-2 bg-indigo-600 hover:bg-indigo-500"
        >
          Satın Al
        </button>
      </div>

      {/* Webhook / post sonucu */}
      {orderNo && (
        <div className="mt-8 rounded-xl border border-white/10 bg-neutral-900/60 p-4">
          <div className="font-semibold mb-2">Sipariş: {orderNo}</div>
          {!log ? (
            <div className="text-neutral-400 text-sm">
              Webhook raporu yok (beklenmedik durum).
            </div>
          ) : log.attempted ? (
            <div className="text-sm">
              <div>
                Cabo Post:{" "}
                {log.sent ? (
                  <span className="text-emerald-400 font-medium">Başarılı</span>
                ) : (
                  <span className="text-red-400 font-medium">Başarısız</span>
                )}{" "}
                — {log.items} kalem gönderildi
              </div>
              <div>HTTP Status: {log.status ?? "-"}</div>
              {log.url ? <div>URL: {log.url}</div> : null}
              {log.responseText ? (
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-neutral-300 bg-neutral-800 rounded p-2">
                  {log.responseText}
                </pre>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-neutral-400">
              Webhook gönderilmedi: <b>{log.reason ?? "bilinmiyor"}</b>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
