import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get("email") || "").trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ ok: true, orders: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      totalAmount: true,
      items: {
        select: {
          id: true,
          productName: true,
          productSlug: true,
          quantity: true,
          lineTotal: true,
        },
      },
    },
  });

  // minor->major
  const shaped = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    total: o.totalAmount / 100,
    items: o.items.map((it) => ({
      id: it.id,
      name: it.productName,
      slug: it.productSlug,
      quantity: it.quantity,
      lineTotal: it.lineTotal / 100,
    })),
  }));

  return NextResponse.json({ ok: true, orders: shaped }, { headers: { "Cache-Control": "no-store" } });
}
