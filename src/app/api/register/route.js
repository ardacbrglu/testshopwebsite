export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

/**
 * Test Shop — Register disabled stub
 * Bu demo uygulamada kayıt akışı yok. İstenirse gerçek kayıt & e-posta aktivasyon
 * sürecini sonra ekleyebiliriz.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "registration_disabled" },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "method_not_allowed" },
    { status: 405, headers: { "Cache-Control": "no-store" } }
  );
}
