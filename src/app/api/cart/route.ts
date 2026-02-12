import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readCartId, writeCartId, readReferralCookie, isReferralValid, type CookieStore } from "@/lib/cookies";
import {
  addCartItem,
  ensureCartId,
  getCartItemsRaw,
  setItemQuantity,
  removeItem,
  getProductBySlug,
  getCartEmail
} from "@/lib/queries";
import { applyDiscountsToItems } from "@/lib/discounter";

export async function GET() {
  const c = (await cookies()) as unknown as CookieStore;

  const cartId = await ensureCartId(readCartId(c));
  writeCartId(c, cartId);

  const ref = readReferralCookie(c);
  const raw = await getCartItemsRaw(cartId);
  const { items, subtotal, total, discount } = applyDiscountsToItems(raw, {
    enabled: isReferralValid(ref),
    referral: ref,
  });

  const email = await getCartEmail(cartId);

  return NextResponse.json({
    cartId,
    email,
    items,
    subtotalCents: subtotal,
    discountCents: discount,
    totalCents: total,
    referral: ref || null
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { productId?: number; slug?: string; quantity?: number };
  const { productId, slug, quantity = 1 } = body;

  const c = (await cookies()) as unknown as CookieStore;

  // ✅ carts(parent) yoksa oluşturup valid numeric id döndürür
  let cartId = await ensureCartId(readCartId(c));
  writeCartId(c, cartId);

  let pid = productId;
  if (!pid && slug) {
    const pr = await getProductBySlug(String(slug));
    if (!pr) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    pid = pr.id;
  }
  if (!pid) return NextResponse.json({ error: "productId or slug required" }, { status: 400 });

  try {
    await addCartItem({ cartId, productId: Number(pid), quantity: Number(quantity) || 1 });
  } catch (e: any) {
    // ✅ Eğer cookie çok eskiyse ve addCartItem "STALE_CART_COOKIE:xxx" diye fail ettiyse toparla
    const msg = String(e?.message || "");
    if (msg.startsWith("STALE_CART_COOKIE:")) {
      cartId = msg.split(":")[1] || (await ensureCartId(null));
      writeCartId(c, cartId);
      await addCartItem({ cartId, productId: Number(pid), quantity: Number(quantity) || 1 });
    } else {
      throw e;
    }
  }

  return GET();
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { productId?: number; quantity?: number };
  const { productId, quantity } = body || {};
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

  const c = (await cookies()) as unknown as CookieStore;
  const cartId = await ensureCartId(readCartId(c));
  writeCartId(c, cartId);

  await setItemQuantity({ cartId, productId: Number(productId), quantity: Number(quantity) || 0 });
  return GET();
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = Number(searchParams.get("productId"));
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

  const c = (await cookies()) as unknown as CookieStore;
  const cartId = await ensureCartId(readCartId(c));
  writeCartId(c, cartId);

  await removeItem(cartId, productId);
  return GET();
}
