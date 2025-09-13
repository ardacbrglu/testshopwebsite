import { cookies } from "next/headers";
import { verifyAuthToken } from "@/lib/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = (await cookies()).get("auth_token")?.value;
    if (!token) return NextResponse.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
    const p = await verifyAuthToken(token);
    return NextResponse.json({ user: { id: p.id, email: p.email, username: p.username } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
