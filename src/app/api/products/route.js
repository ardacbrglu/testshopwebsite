// app/api/products/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseJSON(str, fallback) {
  try { return JSON.parse(str || ""); } catch { return fallback; }
}
function applyDiscount(price, spec) {
  if (!spec) return { price, originalPrice: null };
  const s = String(spec).trim().toUpperCase();
  if (s.endsWith("%")) {
    const pct = Math.max(0, Math.min(100, parseFloat(s.slice(0, -1)) || 0));
    const dp = +(price * (1 - pct / 100)).toFixed(2);
    return { price: dp, originalPrice: price };
  }
  const fixed = parseFloat(s.replace("TRY", "").replace("TL", "")) || 0;
  const dp = Math.max(0, +(price - fixed).toFixed(2));
  return { price: dp, originalPrice: price };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids");
  const hasRef = !!(await cookies()).get("cabo_ref")?.value;
  const discountMap = parseJSON(process.env.CABO_DISCOUNTS_JSON, {});

  // hepsi
  if (!ids) {
    const all = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true, description: true, imageUrl: true, price: true, isActive: true },
    });

    const rows = hasRef
      ? all.map(p => {
          const { price, originalPrice } = applyDiscount(p.price, discountMap[p.slug]);
          return { ...p, price, originalPrice };
        })
      : all;

    return NextResponse.json(rows);
  }

  // belirli id'ler (sepet)
  const list = ids.split(",").map(s => s.trim()).filter(Boolean);
  const prods = await prisma.product.findMany({
    where: { id: { in: list } },
    select: { id: true, slug: true, name: true, description: true, imageUrl: true, price: true, isActive: true },
  });

  const rows = hasRef
    ? prods.map(p => {
        const { price, originalPrice } = applyDiscount(p.price, discountMap[p.slug]);
        return { ...p, price, originalPrice };
      })
    : prods;

  return NextResponse.json(rows);
}
