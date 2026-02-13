// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

const REF_COOKIE = "cabo_attrib";

function sameOrigin(u: URL) {
  return `${u.protocol}//${u.host}`;
}

function normalizeVerifyUrl(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  // kullanıcı root verirse /verify ekle
  if (s.endsWith("/verify")) return s;
  if (s.endsWith("/")) return s + "verify";
  return s + "/verify";
}

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Next internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/assets")) {
    return NextResponse.next();
  }

  const token = url.searchParams.get("token")?.trim() || "";
  const lid = (url.searchParams.get("lid") || url.searchParams.get("linkId") || "").trim();
  const slug = url.searchParams.get("slug")?.trim() || "";

  const CABO_VERIFY_URL = normalizeVerifyUrl(process.env.CABO_VERIFY_URL || "");
  const TESTSHOP_ORIGIN = sameOrigin(url);

  // Ref geldiyse Cabo verify çağır (click write burada olacak)
  if (token && (lid || process.env.CABO_ALLOW_TOKEN_ONLY === "1") && CABO_VERIFY_URL) {
    try {
      const body: any = { token };
      if (lid) body.lid = lid;
      if (slug) body.slug = slug;

      const r = await fetch(CABO_VERIFY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-testshop-origin": TESTSHOP_ORIGIN,
          "x-testshop-ua": req.headers.get("user-agent") || "",
          "x-testshop-referer": req.headers.get("referer") || "",
        },
        body: JSON.stringify(body),
      });

      // Verify OK ise cookie set et
      if (r.ok) {
        const data = (await r.json().catch(() => null)) as any;
        if (data?.ok) {
          const res = NextResponse.next();

          const ts = Math.floor(Date.now() / 1000);
          const payload = encodeURIComponent(
            JSON.stringify({
              token,
              lid: data?.linkId ?? (lid || null),
              slug: data?.slug ?? slug ?? null,
              ts,
            })
          );

          const ttl = Number(process.env.CABO_ATTRIB_TTL_SEC || 3600);

          res.cookies.set(REF_COOKIE, payload, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: Math.max(60, ttl),
          });

          return res;
        }
      }

      // Verify başarısızsa cookie'ye dokunmuyoruz (debug için en temizi)
      return NextResponse.next();
    } catch {
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
