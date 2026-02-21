// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readCartId, type CookieStore } from "@/lib/cookies";
import { ensureCartId, getCartEmail, getOrdersByEmail } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qEmail = (url.searchParams.get("email") || "").trim();

  const c = (await cookies()) as unknown as CookieStore;
  const cartId = await ensureCartId(readCartId(c));

  const email = qEmail || (await getCartEmail(cartId));
  if (!email) return NextResponse.json({ orders: [] });

  const orders = await getOrdersByEmail(email);
  return NextResponse.json({ email, orders });
}