"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
// lib/format içindeki money fonksiyonunu toCurrencyTRY adıyla aliase ediyoruz
import { money as toCurrencyTRY } from "@/lib/format";
import { emitToast } from "@/components/ToastBus";

type Item = { id: string; name: string; quantity: number; priceAtPurchase: number };
type Order = { id: string; orderNumber: string; totalAmount: number; createdAt: string; items: Item[] };

type Props = { orders?: Order[] };

export default function OrdersClient({ orders: ordersProp }: Props) {
  const [orders, setOrders] = useState<Order[]>(ordersProp ?? []);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const handledRef = useRef(false); // StrictMode'da çifte çalışmayı engeller
  const sp = useSearchParams();

  // İlk render'da prop yoksa localStorage'dan yükle
  useEffect(() => {
    if (!ordersProp) {
      try {
        const raw = localStorage.getItem("orders");
        if (raw) setOrders(JSON.parse(raw));
      } catch {
        setOrders([]);
      }
    }
  }, [ordersProp]);

  // /orders?ok=1&ord=XYZ → toast + param silme
  useEffect(() => {
    if (handledRef.current) return;

    const ok = sp.get("ok");
    const ord = sp.get("ord");
    if (ok === "1") {
      handledRef.current = true;

      try {
        emitToast?.({
          type: "success",
          title: "Satın alma tamamlandı",
          desc: ord ? `Sipariş ${ord} oluşturuldu.` : undefined,
          duration: 4000,
        });
      } catch {
        // ToastBus yoksa sessiz geç
        console.info("Satın alma tamamlandı", ord ? `Sipariş ${ord}` : "");
      }

      // Parametreleri temizle (yeniden yönlendirme yok)
      const url = new URL(window.location.href);
      url.searchParams.delete("ok");
      url.searchParams.delete("ord");
      window.history.replaceState(null, "", url);
    }
  }, [sp]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold mb-2">Satın Alımlarım</h1>

      {orders.length === 0 ? (
        <p>Henüz siparişiniz yok.</p>
      ) : (
        orders.map((o) => {
          const isOpen = !!open[o.id];
          const formattedDate = new Date(o.createdAt).toLocaleString("tr-TR");
          return (
            <div key={o.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/60">
              <button
                className="w-full px-4 py-3 text-left"
                onClick={() => setOpen((s) => ({ ...s, [o.id]: !s[o.id] }))}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <div className="font-mono text-sm truncate sm:w-48">{o.orderNumber}</div>
                  <div className="text-xs sm:text-sm text-neutral-400 sm:w-56">{formattedDate}</div>
                  <div className="sm:ml-auto font-semibold">{toCurrencyTRY(o.totalAmount)}</div>
                  <div className="text-neutral-400 sm:pl-3">{isOpen ? "▲" : "▼"}</div>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4">
                  <div className="divide-y divide-neutral-800">
                    {o.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between py-2">
                        <div className="text-sm">
                          {it.name} × {it.quantity}
                        </div>
                        <div className="text-sm text-neutral-300">
                          {toCurrencyTRY(it.priceAtPurchase * it.quantity)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
