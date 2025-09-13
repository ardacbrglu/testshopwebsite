export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

/**
 * Test Shop — Auth disabled stub
 * Bu demo uygulamada login akışı yok. Eğer auth eklemek istersen haber ver,
 * Prisma kullanan gerçek bir /api/login yazalım.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "auth_disabled" },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "method_not_allowed" },
    { status: 405, headers: { "Cache-Control": "no-store" } }
  );
}
