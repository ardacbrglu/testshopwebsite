import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { toCurrencyTRY } from "@/lib/format";

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if(!user) redirect("/login");

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { orderItems: { include: { product: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Satın Alımlarım</h1>
      {orders.length===0 && <p>Henüz sipariş yok.</p>}
      {orders.map(o=>(
        <div key={o.id} className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Order #{o.orderNumber}</div>
            <div className="text-neutral-300">{new Date(o.createdAt).toLocaleString("tr-TR")}</div>
          </div>
          <div className="space-y-2">
            {o.orderItems.map(it=>(
              <div key={it.id} className="flex items-center justify-between text-sm">
                <div>{it.product.name} × {it.quantity}</div>
                <div>{toCurrencyTRY(it.priceAtPurchase * it.quantity)}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-neutral-800 mt-3 pt-3 text-right font-semibold">
            Toplam: {toCurrencyTRY(o.totalAmount)}
          </div>
        </div>
      ))}
    </div>
  );
}
