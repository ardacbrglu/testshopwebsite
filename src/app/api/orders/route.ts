import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readCartId, type CookieStore } from "@/lib/cookies";
import { ensureCartId, getCartEmail, getOrdersByEmail } from "@/lib/queries";

export async function GET() {
  const c = (await cookies()) as unknown as CookieStore;
  const cartId = await ensureCartId(readCartId(c));
  const email = await getCartEmail(cartId);
  if (!email) return NextResponse.json({ error: "EMAIL_REQUIRED" }, { status: 400 });

  const orders = await getOrdersByEmail(email);
  return NextResponse.json({ email, orders });
}
