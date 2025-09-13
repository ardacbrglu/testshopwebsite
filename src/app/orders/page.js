export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import OrdersClient from "./ui/OrdersClient";

export default async function OrdersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const orders = await prisma.order.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    include: { orderItems: { include: { product: true } } },
  });

  const data = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    totalAmount: o.totalAmount,
    createdAt: o.createdAt.toISOString(),
    items: o.orderItems.map((it) => ({
      id: it.id,
      name: it.product.name,
      quantity: it.quantity,
      priceAtPurchase: it.priceAtPurchase,
    })),
  }));

  return <OrdersClient orders={data} />;
}
