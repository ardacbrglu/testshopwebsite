import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readCartId,
  readReferralCookie,
  type CookieStore,
} from "@/lib/cookies";
import {
  ensureCartId,
  getCartItemsRaw,
  clearCart,
  recordOrder,
  getCartEmail,
} from "@/lib/queries";
import { applyDiscountsToItems, isReferralValid } from "@/lib/discounter";
import { postPurchaseToCabo } from "@/lib/cabo";

export async function POST() {
  try {
    const c = (await cookies()) as unknown as CookieStore;
    const cartId = await ensureCartId(readCartId(c));

    const email = await getCartEmail(cartId);
    if (!email)
      return NextResponse.json({ error: "EMAIL_REQUIRED" }, { status: 400 });

    const raw = await getCartItemsRaw(cartId);
    if (!raw.length)
      return NextResponse.json({ error: "CART_EMPTY" }, { status: 400 });

    const ref = readReferralCookie(c);
    const { items, total } = applyDiscountsToItems(raw, {
      enabled: isReferralValid(ref),
      referral: ref,
    });

    // 1) siparişi kaydet (başarısızsa 500)
    const orderId = await recordOrder(email, items, total);

    // 2) ref geçerliyse Cabo'ya POST (başarısız olsa da akış bozulmaz; log yazılır)
    if (ref && isReferralValid(ref) && (process.env.CABO_WEBHOOK_URL || "").length > 0) {
      const byIds = process.env.CABO_USE_PRODUCT_IDS === "1";

      // ⬇️ TypeScript hatasını çözen tipli parse
      const map: Record<string, { code?: string }> = (() => {
        try {
          return JSON.parse(
            process.env.CABO_MAP_JSON || "{}"
          ) as Record<string, { code?: string }>;
        } catch {
          return {};
        }
      })();

      const caboItems = items.map((it) => ({
        product_id: byIds ? it.productId : undefined,
        product_code: !byIds ? map[it.slug]?.code || undefined : undefined,
        quantity: it.quantity,
        unit_price_cents: it.unitPriceCents,
        final_price_cents: it.finalUnitPriceCents,
      }));

      await postPurchaseToCabo({
        orderId,
        cartId,
        email,
        token: ref?.token,
        linkId: ref?.lid,
        items: caboItems,
        total_cents: total,
      });
    }

    // 3) sepeti temizle ve dön
    await clearCart(cartId);
    return NextResponse.json({ ok: true, cartId, orderId });
  } catch (err) {
    return NextResponse.json(
      { error: "UNEXPECTED", message: String(err) },
      { status: 500 }
    );
  }
}
