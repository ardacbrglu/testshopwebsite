// src/app/orders/page.js
import { query } from "@/lib/db";

function fmtTRY(k){ const n=(Number(k||0)/100); return n.toLocaleString("tr-TR",{style:"currency",currency:"TRY",minimumFractionDigits:2,maximumFractionDigits:2}); }

export default async function OrdersPage({ searchParams }) {
  const sp = await searchParams;
  const rows = await query(
    `SELECT id, order_number, email, total_amount, discount_total, created_at AS createdAt
     FROM orders
     ORDER BY id DESC
     LIMIT 50`
  );

  const toastScript = sp?.ok ? `
    window.addEventListener("load",()=> {
      window.dispatchEvent(new CustomEvent("toast",{ detail:{ type:"success", text:"Satın alım başarılı." } }));
      const url=new URL(location.href); url.searchParams.delete("ok"); url.searchParams.delete("ord");
      history.replaceState(null,"",url.toString());
    });
  ` : "";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">Satın Alımlarım</h1>

      {rows.length === 0 && <div className="text-neutral-400">Kayıt bulunamadı.</div>}

      <div className="space-y-3">
        {rows.map(r=>(
          <div key={r.id} className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <div className="font-medium">#{r.order_number}</div>
            <div className="text-sm text-neutral-400">{new Date(r.createdAt).toLocaleString("tr-TR")}</div>
            <div className="mt-1 text-sm">E-posta: {r.email}</div>
            <div className="mt-1">Tutar: <b>{fmtTRY(r.total_amount)}</b> {Number(r.discount_total)>0 && <span className="text-green-400 ml-2">İndirim: −{fmtTRY(r.discount_total)}</span>}</div>
          </div>
        ))}
      </div>

      {toastScript && <script dangerouslySetInnerHTML={{ __html: toastScript }} />}
    </main>
  );
}
