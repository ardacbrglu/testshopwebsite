import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readCartId, readReferralCookie } from "@/lib/cookies";
import { ensureCartId, getCartItemsRaw, clearCart, recordOrder, getCartEmail } from "@/lib/queries";
import { applyDiscountsToItems, isReferralValid } from "@/lib/discounter";
import { postPurchaseToCabo } from "@/lib/cabo";

export async function POST() {
  try {
    const c = await cookies();
    const cartId = await ensureCartId(readCartId(c));

    const email = await getCartEmail(cartId);
    if (!email) return NextResponse.json({ error: "EMAIL_REQUIRED" }, { status: 400 });

    const raw = await getCartItemsRaw(cartId);
    if (!raw.length) return NextResponse.json({ error: "CART_EMPTY" }, { status: 400 });

    const ref = readReferralCookie(c);
    const { items, total } = applyDiscountsToItems(raw as any, {
      enabled: isReferralValid(ref),
      referral: ref,
    });

    const orderId = await recordOrder(email, items, total).catch(() => null);

    if (ref && isReferralValid(ref) && (process.env.CABO_WEBHOOK_URL || "").length > 0) {
      try {
        const byIds = process.env.CABO_USE_PRODUCT_IDS === "1";
        const map = (() => { try { return JSON.parse(process.env.CABO_MAP_JSON || "{}"); } catch { return {}; } })();

        const caboItems = items.map((it) => ({
          product_id: byIds ? it.productId : undefined,
          product_code: !byIds ? (map[it.slug]?.code || undefined) : undefined,
          quantity: it.quantity,
          unit_price_cents: it.unitPriceCents,
          final_price_cents: it.finalUnitPriceCents,
        }));

        await postPurchaseToCabo({
          cartId, email, token: ref?.token, linkId: ref?.lid, items: caboItems, total_cents: total,
        });
      } catch { /* demoda post hatasını yut */ }
    }

    await clearCart(cartId);
    return NextResponse.json({ ok: true, cartId, orderId });
  } catch (err: any) {
    return NextResponse.json({ error: "UNEXPECTED", message: String(err?.message || err) }, { status: 500 });
  }
}
