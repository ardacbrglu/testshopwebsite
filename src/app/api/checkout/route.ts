// src/app/api/checkout/route.ts
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCaboConfig, refFromRequest, isDiscountActiveFor, applyDiscount, round2, hmacSha256Hex } from "@/lib/cabo-integration";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

type ClientCartItem = { slug: string; quantity: number };
type DBProduct = { id: string; slug: string; name: string; price: number; currency: string };
type UiItem = { slug: string; name: string; quantity: number; unitPrice: number };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || !Array.isArray((body as any).items) || typeof (body as any).email !== "string") {
      return NextResponse.json({ ok: false as const, error: "bad_request" }, { status: 400 });
    }

    const items = (body as { items: ClientCartItem[] }).items;
    const email = (body as { email: string }).email.trim().toLowerCase();
    if (!email) return NextResponse.json({ ok: false as const, error: "missing_email" }, { status: 400 });

    const { map, keyId, secret, webhook, useProductIds, scope } = getCaboConfig();
    const ref = refFromRequest(req);

    const slugs = [...new Set(items.map((i) => i.slug))];
    const dbProducts: DBProduct[] = await prisma.product.findMany({
      where: { slug: { in: slugs }, isActive: true },
      select: { id: true, slug: true, name: true, price: true, currency: true },
    }) as unknown as DBProduct[];

    const bySlug = new Map<string, DBProduct>(dbProducts.map((prod) => [prod.slug, prod] as const));

    const uiItems: UiItem[] = [];
    const caboItems: Array<{ productCode?: string; productId?: string; quantity: number; unitPriceCharged: number; lineTotal: number }> = [];
    let totalCents = 0;

    for (const it of items) {
      const row = bySlug.get(it.slug);
      if (!row) continue;

      const qty = Math.max(1, Math.floor(it.quantity || 1));
      const entry = map[row.slug];

      const active = isDiscountActiveFor(row.slug, { scope, tokenActive: ref.active, landingSlug: ref.landingSlug, preview: ref.preview });
      const d = entry && active ? entry.discount : undefined;

      const unitFinal = applyDiscount(row.price / 100, d).final;     // ₺
      const unitFinalCents = Math.round(unitFinal * 100);            // kuruş
      const line = unitFinalCents * qty;
      totalCents += line;

      uiItems.push({ slug: row.slug, name: row.name, quantity: qty, unitPrice: round2(unitFinal) });

      if (entry && active) {
        caboItems.push({
          ...(useProductIds ? { productId: entry.productId } : { productCode: entry.code }),
          quantity: qty,
          unitPriceCharged: round2(unitFinal),
          lineTotal: round2((unitFinalCents * qty) / 100),
        });
      }
    }

    if (uiItems.length === 0) {
      return NextResponse.json({ ok: false as const, error: "empty_cart_or_inactive" }, { status: 400 });
    }

    const orderNumber = "TS-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    // user upsert
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email },
      select: { id: true },
    });

    // order + items
    await prisma.order.create({
      data: {
        orderNumber,
        userId: user.id,
        status: "confirmed",
        currency: "TRY",
        totalAmount: totalCents,
        caboRef: ref.token ?? null,
        items: {
          create: uiItems.map((u) => {
            const p = bySlug.get(u.slug)!; // DBProduct garanti
            const unitCents = Math.round(u.unitPrice * 100);
            return {
              productId: p.id,
              productName: p.name,
              productSlug: p.slug,
              quantity: u.quantity,
              unitPriceAtPurchase: unitCents,
              lineTotal: unitCents * u.quantity,
            };
          }),
        },
      },
    });

    // Cabo S2S
    let caboMessage: string | undefined = undefined;
    if (ref.active && caboItems.length > 0) {
      if (!webhook || !keyId || !secret) {
        caboMessage = "webhook_not_configured";
      } else {
        const payload = { orderNumber, caboRef: ref.token, items: caboItems, status: "confirmed" as const };
        const raw = JSON.stringify(payload);
        const ts = Math.floor(Date.now() / 1000);
        // [CABO-INTEGRATION] HMAC imza: ts + "." + rawBody
        const sig = hmacSha256Hex(secret, `${ts}.${raw}`);
        try {
          const res = await fetch(webhook, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // [CABO-INTEGRATION]
              "X-Cabo-Key-Id": keyId,
              "X-Cabo-Timestamp": String(ts),
              "X-Cabo-Signature": sig,
              // back-compat
              "X-Key-Id": keyId,
              "X-Timestamp": String(ts),
              "X-Signature": sig,
            },
            body: raw,
            cache: "no-store",
          });
          caboMessage = res.ok ? "webhook_ok" : `webhook_failed_${res.status}`;
        } catch {
          caboMessage = "webhook_network_error";
        }
      }
    } else {
      caboMessage = "no_ref_or_no_contracted_items";
    }

    return NextResponse.json({
      ok: true as const,
      orderNumber,
      email,
      items: uiItems,
      summary: { total: round2(totalCents / 100), itemCount: uiItems.reduce((s, i) => s + i.quantity, 0) },
      message: caboMessage,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false as const, error: "server_error" }, { status: 500 });
  }
}
