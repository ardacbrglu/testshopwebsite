// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

const REF_COOKIE = "cabo_attrib";

function sameOrigin(u: URL) {
  return `${u.protocol}//${u.host}`;
}

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Static / next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets")
  ) {
    return NextResponse.next();
  }

  const token = url.searchParams.get("token")?.trim() || "";
  const lid = url.searchParams.get("lid")?.trim() || "";
  const slug = url.searchParams.get("slug")?.trim() || "";

  const CABO_VERIFY_URL = (process.env.CABO_VERIFY_URL || "").trim();
  const TESTSHOP_ORIGIN = sameOrigin(url);

  // 1) Ref geldiyse: Cabo verify yap, sadece OK ise cookie set et
  if (token && lid && CABO_VERIFY_URL) {
    try {
      const r = await fetch(CABO_VERIFY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-testshop-origin": TESTSHOP_ORIGIN,
          "x-testshop-ua": req.headers.get("user-agent") || "",
          "x-testshop-referer": req.headers.get("referer") || "",
        },
        body: JSON.stringify({ token, lid, slug: slug || null }),
        // middleware fetch default no-cache good enough
      });

      if (r.ok) {
        const data = (await r.json().catch(() => null)) as any;

        // Cabo "ok:true" döndüyse yaz
        if (data?.ok) {
          const res = NextResponse.next();

          const ts = Math.floor(Date.now() / 1000);
          const payload = encodeURIComponent(
            JSON.stringify({
              token,
              lid,
              slug: data?.slug || slug || null,
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

      // Verify başarısızsa attribution temizle (ref sahte/expired)
      const bad = NextResponse.next();
      bad.cookies.set(REF_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
      return bad;
    } catch {
      // Cabo ulaşılamadı: cookie set etme, dokunma
      return NextResponse.next();
    }
  }

  // 2) Ref yoksa: “direct visit” ise attribution temizle
  // Senin beklentin: ref’siz /products gelince indirim görünmesin.
  // Bunu sağlamak için /products, /cart, /checkout gibi flow sayfalarında cookie’yi sıfırlıyoruz.
  const shouldClear =
    pathname === "/products" ||
    pathname.startsWith("/products/") ||
    pathname === "/cart" ||
    pathname.startsWith("/cart/") ||
    pathname === "/checkout" ||
    pathname.startsWith("/checkout/");

  if (shouldClear) {
    const res = NextResponse.next();
    res.cookies.set(REF_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
