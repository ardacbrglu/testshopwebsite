// src/app/orders/page.js
import { query } from "@/lib/db";
import { toPriceTextTRY } from "@/lib/currency";

export const dynamic = "force-dynamic";

export default async function Orders() {
  const orders = await query("SELECT id, order_number, total_amount, discount_total, created_at FROM orders ORDER BY id DESC LIMIT 20");
  const itemsByOrder = {};
  const items = await query(
    "SELECT order_id, product_slug, product_name, quantity, unit_price, unit_price_after_discount FROM order_items ORDER BY id DESC LIMIT 200"
  );
  for (const it of items) {
    (itemsByOrder[it.order_id] ||= []).push(it);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Orders</h1>
      <div className="space-y-4">
        {orders.map((o) => (
          <div key={o.id} className="rounded-2xl border border-neutral-800 p-4 bg-neutral-900">
            <div className="flex justify-between mb-2">
              <div className="text-sm text-neutral-400">{o.order_number}</div>
              <div className="text-sm text-neutral-400">{new Date(o.created_at).toLocaleString("tr-TR")}</div>
            </div>
            <div className="text-sm mb-2">
              Toplam: <b>{toPriceTextTRY(o.total_amount)}</b>{" "}
              {o.discount_total > 0 && (
                <span className="ml-2 text-green-400">İndirim: −{toPriceTextTRY(o.discount_total)}</span>
              )}
            </div>
            <ul className="text-sm text-neutral-300 list-disc ml-6">
              {(itemsByOrder[o.id] || []).map((it, idx) => (
                <li key={idx}>
                  {it.product_name} ×{it.quantity} —{" "}
                  {toPriceTextTRY(it.unit_price_after_discount)}{" "}
                  <span className="text-neutral-500 line-through ml-1">{toPriceTextTRY(it.unit_price)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
