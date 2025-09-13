import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { signAuthToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  identifier: z.string().trim().min(3).max(254), // email veya username
  password: z.string().min(6).max(128),
});

export async function POST(req) {
  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Geçersiz giriş." }, { status: 400 });
    }

    const { identifier, password } = parsed.data;
    const emailLike = identifier.includes("@") ? identifier.toLowerCase() : null;

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailLike || "" }, { username: identifier }],
      },
    });
    if (!user) return NextResponse.json({ error: "Geçersiz bilgiler." }, { status: 401 });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Geçersiz bilgiler." }, { status: 401 });

    const token = await signAuthToken({ id: user.id, email: user.email, username: user.username });

    const res = NextResponse.json({ ok: true });
    const isProd = process.env.NODE_ENV === "production";
    res.cookies.set("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 gün
    });
    return res;
  } catch {
    return NextResponse.json({ error: "İstek hatalı." }, { status: 400 });
  }
}
