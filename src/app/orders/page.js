// src/app/orders/page.js
import { query } from "@/lib/db";

function fmtTRY(k) {
  const n = Number(k || 0) / 100;
  return n.toLocaleString("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const orders = await query(
    "SELECT id, order_number, email, total_amount, discount_total, created_at FROM orders ORDER BY id DESC LIMIT 100"
  );
  const items = await query(
    "SELECT order_id, product_name, product_slug, quantity, unit_price, unit_price_after_discount FROM order_items ORDER BY id DESC"
  );

  const byOrder = {};
  for (const it of items) {
    if (!byOrder[it.order_id]) byOrder[it.order_id] = [];
    byOrder[it.order_id].push(it);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Satın Alımlarım</h1>

      {orders.length === 0 ? (
        <p>Henüz sipariş yok.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900">
              <div className="flex flex-wrap justify-between gap-2 mb-2">
                <div className="text-sm text-neutral-400">{o.order_number}</div>
                <div className="text-sm text-neutral-400">{o.email}</div>
                <div className="text-sm text-neutral-400">{new Date(o.created_at).toLocaleString("tr-TR")}</div>
              </div>

              <div className="text-sm mb-2">
                Toplam: <b>{fmtTRY(o.total_amount)}</b>
                {o.discount_total > 0 && (
                  <span className="ml-2 text-green-400">İndirim: −{fmtTRY(o.discount_total)}</span>
                )}
              </div>

              <ul className="text-sm text-neutral-300 list-disc ml-6">
                {(byOrder[o.id] || []).map((it, i) => (
                  <li key={i}>
                    {it.product_name} ×{it.quantity} —{" "}
                    <span className="font-medium">{fmtTRY(it.unit_price_after_discount)}</span>
                    <span className="text-neutral-500 line-through ml-2">{fmtTRY(it.unit_price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
