// src/app/api/cart/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readCartId,
  writeCartId,
  readReferralCookie,
  isReferralValid,
  type CookieStore,
} from "@/lib/cookies";
import type { RawCartRow } from "@/lib/types";
import {
  addCartItem,
  ensureCartId,
  getCartItemsRaw,
  setItemQuantity,
  removeItem,
  getProductBySlug,
  getCartEmail,
} from "@/lib/queries";
import { applyDiscountsToItems } from "@/lib/discounter";

async function buildCartResponse(c: CookieStore, cartId: string) {
  writeCartId(c, cartId);

  const ref = readReferralCookie(c);
  const raw: RawCartRow[] = await getCartItemsRaw(cartId);

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
    referral: ref || null,
  });
}

export async function GET() {
  const c = (await cookies()) as unknown as CookieStore;
  const cartId = await ensureCartId(readCartId(c));
  return buildCartResponse(c, cartId);
}

type CartPostJson = { productId?: number; slug?: string; quantity?: number };

async function parsePostBody(req: NextRequest): Promise<CartPostJson> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as unknown;
    if (typeof body !== "object" || body === null) return {};
    const b = body as Record<string, unknown>;
    return {
      productId: typeof b.productId === "number" ? b.productId : undefined,
      slug: typeof b.slug === "string" ? b.slug : undefined,
      quantity: typeof b.quantity === "number" ? b.quantity : undefined,
    };
  }

  // ✅ HTML form support (x-www-form-urlencoded or multipart)
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return {};
    const slug = fd.get("slug");
    const productId = fd.get("productId");
    const quantity = fd.get("quantity");
    return {
      slug: typeof slug === "string" ? slug : undefined,
      productId: typeof productId === "string" ? Number(productId) : undefined,
      quantity: typeof quantity === "string" ? Number(quantity) : undefined,
    };
  }

  return {};
}

export async function POST(req: NextRequest) {
  const body = await parsePostBody(req);
  const { productId, slug } = body;
  const quantity = Math.max(1, Number(body.quantity || 1));

  const c = (await cookies()) as unknown as CookieStore;
  const cartId = await ensureCartId(readCartId(c));
  writeCartId(c, cartId);

  let pid = productId;

  if (!pid && slug) {
    const pr = await getProductBySlug(String(slug));
    if (!pr) return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
    pid = pr.id;
  }
  if (!pid) return NextResponse.json({ error: "PRODUCT_ID_OR_SLUG_REQUIRED" }, { status: 400 });

  await addCartItem({
    cartId,
    productId: Number(pid),
    quantity,
  });

  return buildCartResponse(c, cartId);
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as unknown;
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const productId = Number(b.productId);
  const quantity = Number(b.quantity);

  if (!productId) return NextResponse.json({ error: "PRODUCT_ID_REQUIRED" }, { status: 400 });

  const c = (await cookies()) as unknown as CookieStore;
  const cartId = await ensureCartId(readCartId(c));

  await setItemQuantity({
    cartId,
    productId,
    quantity: Number.isFinite(quantity) ? quantity : 0,
  });

  return buildCartResponse(c, cartId);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = Number(searchParams.get("productId"));
  if (!productId) return NextResponse.json({ error: "PRODUCT_ID_REQUIRED" }, { status: 400 });

  const c = (await cookies()) as unknown as CookieStore;
  const cartId = await ensureCartId(readCartId(c));

  await removeItem(cartId, productId);
  return buildCartResponse(c, cartId);
}