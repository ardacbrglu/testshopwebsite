import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RegisterSchema = z.object({
  username: z.string().trim().min(3).max(32),
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
});

export async function POST(req) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Geçersiz giriş." }, { status: 400 });
    }

    const { username, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const exists = await prisma.user.findFirst({
      where: { OR: [{ email: normalizedEmail }, { username }] },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json({ error: "Kullanıcı zaten var." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { username, email: normalizedEmail, passwordHash } });

    return NextResponse.json({ ok: true, message: "Kayıt başarılı." }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "İstek hatalı." }, { status: 400 });
  }
}
