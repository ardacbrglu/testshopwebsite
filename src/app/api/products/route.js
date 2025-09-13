import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids");

  if (!ids) {
    const all = await prisma.product.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
    return NextResponse.json(all);
  }

  const list = ids.split(",").map(s => s.trim()).filter(Boolean);
  const rows = await prisma.product.findMany({ where: { id: { in: list } } });
  return NextResponse.json(rows);
}
