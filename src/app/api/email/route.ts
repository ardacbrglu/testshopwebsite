import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readCartId } from "@/lib/cookies";
import { ensureCartId, setCartEmail } from "@/lib/queries";

const normEmail = (e: string) => String(e || "").trim().toLowerCase();
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normEmail(body?.email || "");
  if (!isValidEmail(email)) return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });

  const c = await cookies();
  const cartId = await ensureCartId(readCartId(c));
  await setCartEmail(cartId, email);
  return NextResponse.json({ ok: true });
}
