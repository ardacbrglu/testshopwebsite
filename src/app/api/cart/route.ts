// src/app/api/cart/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { activeDiscountPctForSlugServer, calcDiscountedUnitPrice } from "@/lib/attribution";

const COOKIE_NAME = "cart_id";

type CartRow = { id: number; email: string | null; created_at: string };
type ItemRow = {
  id: number;
  product_id: number;
  quantity: number;
  slug: string;
  name: string;
  price: number; // kuruş
  imageUrl: string;
};

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

async function getOrCreateCartId(): Promise<number> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing && Number.isFinite(Number(existing))) return Number(existing);

  // yeni cart oluştur
  const ins = await query("INSERT INTO carts (email) VALUES (NULL)");
  const insertedId = (ins as unknown as { insertId: number }).insertId;

  // Route Handler içindeyiz: cookies().set kullanmak doğru
  store.set(COOKIE_NAME, String(insertedId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 gün
  });

  return insertedId;
}

// --- GET /api/cart
export async function GET() {
  try {
    const cartId = await getOrCreateCartId();

    // email
    const cartRows = (await query("SELECT id, email, created_at FROM carts WHERE id=?", [
      cartId,
    ])) as CartRow[];
    const email = cartRows[0]?.email || "";

    // items
    const rows = (await query(
      `SELECT ci.id, ci.product_id, ci.quantity, p.slug, p.name, p.price, p.imageUrl
       FROM cart_items ci
       JOIN products p ON p.id=ci.product_id
       WHERE ci.cart_id=?
       ORDER BY ci.id ASC`,
      [cartId]
    )) as ItemRow[];

    // indirim uygula (gating attribution.ts içinde)
    const items = [];
    for (const r of rows) {
      const pct = await activeDiscountPctForSlugServer(r.slug);
      const { finalPrice, applied } = calcDiscountedUnitPrice(Number(r.price), pct);
      items.push({
        id: r.id,
        productId: r.product_id,
        quantity: r.quantity,
        slug: r.slug,
        name: r.name,
        price: r.price,
        imageUrl: r.imageUrl,
        discountPct: applied ? pct : 0,
        unitAfter: finalPrice,
      });
    }

    return noStore(
      NextResponse.json({
        email,
        items,
      })
    );
  } catch (_e) {
    return noStore(NextResponse.json({ error: "Cart load error" }, { status: 500 }));
  }
}

// --- POST /api/cart  { productId, quantity }
export async function POST(req: Request) {
  try {
    const { productId, quantity = 1 } = (await req.json()) as {
      productId: number;
      quantity?: number;
    };
    if (!productId || Number(quantity) <= 0) {
      return noStore(NextResponse.json({ error: "Geçersiz istek" }, { status: 400 }));
    }

    const cartId = await getOrCreateCartId();

    const exist = (await query(
      "SELECT id, quantity FROM cart_items WHERE cart_id=? AND product_id=? LIMIT 1",
      [cartId, productId]
    )) as { id: number; quantity: number }[];

    if (exist.length) {
      await query("UPDATE cart_items SET quantity=quantity+? WHERE id=?", [
        Number(quantity),
        exist[0].id,
      ]);
    } else {
      await query(
        "INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)",
        [cartId, productId, Number(quantity)]
      );
    }

    return noStore(NextResponse.json({ ok: true }));
  } catch (_e) {
    return noStore(NextResponse.json({ error: "Sepete eklenemedi" }, { status: 500 }));
  }
}

// --- PATCH /api/cart  { email }
export async function PATCH(req: Request) {
  try {
    const { email } = (await req.json()) as { email: string };
    const cartId = await getOrCreateCartId();
    await query("UPDATE carts SET email=? WHERE id=?", [String(email || ""), cartId]);
    return noStore(NextResponse.json({ ok: true }));
  } catch (_e) {
    return noStore(NextResponse.json({ error: "E-posta kaydedilemedi" }, { status: 500 }));
  }
}

// --- PUT /api/cart  { itemId, quantity }
export async function PUT(req: Request) {
  try {
    const { itemId, quantity } = (await req.json()) as { itemId: number; quantity: number };
    if (!itemId || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      return noStore(NextResponse.json({ error: "Geçersiz istek" }, { status: 400 }));
    }
    await query("UPDATE cart_items SET quantity=? WHERE id=?", [Number(quantity), itemId]);
    return noStore(NextResponse.json({ ok: true }));
  } catch (_e) {
    return noStore(NextResponse.json({ error: "Güncellenemedi" }, { status: 500 }));
  }
}

// --- DELETE /api/cart  { itemId }
export async function DELETE(req: Request) {
  try {
    const { itemId } = (await req.json()) as { itemId: number };
    if (!itemId) {
      return noStore(NextResponse.json({ error: "Geçersiz istek" }, { status: 400 }));
    }
    await query("DELETE FROM cart_items WHERE id=?", [itemId]);
    return noStore(NextResponse.json({ ok: true }));
  } catch (_e) {
    return noStore(NextResponse.json({ error: "Silinemedi" }, { status: 500 }));
  }
}
