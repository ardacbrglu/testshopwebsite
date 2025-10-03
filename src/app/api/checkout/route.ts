import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readCartId,
  readReferralCookie,
  isReferralValid,
  type CookieStore,
} from "@/lib/cookies";
import {
  ensureCartId,
  getCartItemsRaw,
  clearCart,
  recordOrder,
  getCartEmail,
} from "@/lib/queries";
import {
  applyDiscountsToItems,
  getAttributionScope,
  loadMap,
  isSlugEligible,
} from "@/lib/discounter";
import { postPurchaseToCabo } from "@/lib/cabo";

export async function POST() {
  try {
    const c = (await cookies()) as unknown as CookieStore;
    const cartId = await ensureCartId(readCartId(c));

    const email = await getCartEmail(cartId);
    if (!email) return NextResponse.json({ error: "EMAIL_REQUIRED" }, { status: 400 });

    const raw = await getCartItemsRaw(cartId);
    if (!raw.length) return NextResponse.json({ error: "CART_EMPTY" }, { status: 400 });

    // İndirim (landing/sitewide kurallarıyla)
    const ref = readReferralCookie(c);
    const { items, total } = applyDiscountsToItems(raw, {
      enabled: isReferralValid(ref),
      referral: ref,
    });

    // 1) siparişi kaydet
    const orderId = await recordOrder(email, items, total);

    // 2) Cabo POST (ref geçerliyse)
    if (ref && isReferralValid(ref) && (process.env.CABO_WEBHOOK_URL || "").length > 0) {
      const byIds = String(process.env.CABO_USE_PRODUCT_IDS || "0") === "1";
      const map   = loadMap();
      const scope = getAttributionScope();

      // yalnızca eligible (landing/sitewide) olan satın alınan ürünler post edilsin
      const effective = items.filter((it) => isSlugEligible(scope, map, it.slug, ref));

      if (effective.length) {
        const caboItems = effective.map((it) => ({
          product_id: byIds ? it.productId : undefined,
          product_code: !byIds ? (map[it.slug]?.code || undefined) : undefined,
          quantity: it.quantity,
          unit_price_cents: it.unitPriceCents,
          final_price_cents: it.finalUnitPriceCents,
        }));

        await postPurchaseToCabo({
          orderId,
          cartId,
          email,
          token: ref?.token || null,
          // 🔧 DÜZELTİLEN SATIR: any cast yok, doğal birlik: string | number | null
          linkId: ref?.lid ?? null,
          items: caboItems,
          total_cents: total,
        });
      }
    }

    // 3) sepeti temizle
    await clearCart(cartId);
    return NextResponse.json({ ok: true, cartId, orderId });
  } catch (err) {
    return NextResponse.json(
      { error: "UNEXPECTED", message: String(err) },
      { status: 500 }
    );
  }
}
