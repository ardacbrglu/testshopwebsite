import { NextRequest, NextResponse } from "next/server";

const REF_COOKIE = "cabo_attrib"; // TestShop cookie adı (lib/cookies.ts ile aynı)

function jsonCookie(value: unknown) {
  return encodeURIComponent(JSON.stringify(value));
}

function getSlugFromPath(pathname: string) {
  // /products/<slug>
  const m = pathname.match(/^\/products\/([^\/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function isStaticPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

async function verifyWithCabo(args: {
  token: string;
  lid: string;
  slug?: string | null;
  origin: string;
  ua: string;
  referer: string;
}) {
  const base = (process.env.CABO_VERIFY_URL || "").trim(); // e.g. https://cabo-platform.../api/testshop_verify
  if (!base) return { ok: false as const, status: 500, error: "missing_CABO_VERIFY_URL" };

  // Cabo tarafında /verify destekli (senin route’un öyle)
  const url = base.endsWith("/verify") ? base : `${base.replace(/\/$/, "")}/verify`;

  const body = {
    token: args.token,
    lid: Number(args.lid),
    slug: args.slug || undefined,
  };

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Cabo verify kodun bunları okuyordu:
        origin: args.origin,
        "x-testshop-origin": args.origin,
        "x-testshop-ua": args.ua,
        "x-testshop-referer": args.referer,
      },
      body: JSON.stringify(body),
      // middleware fetch default: no-cache; burada özel gerek yok
    });

    const txt = await r.text().catch(() => "");
    if (!r.ok) {
      return { ok: false as const, status: r.status, error: `cabo_verify_${r.status}`, detail: txt.slice(0, 300) };
    }

    // beklenen: { ok:true, linkId, productId, slug }
    const data = JSON.parse(txt || "{}");
    if (!data?.ok) return { ok: false as const, status: 502, error: "cabo_verify_bad_response" };

    return { ok: true as const, status: 200, data };
  } catch (e: any) {
    return { ok: false as const, status: 502, error: "cabo_verify_fetch_failed", detail: String(e?.message || e).slice(0, 300) };
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Static file vb. dokunma
  if (isStaticPath(pathname)) return NextResponse.next();

  // Sadece GET/HEAD’de attribution yakala (navigasyon)
  if (req.method !== "GET" && req.method !== "HEAD") return NextResponse.next();

  const token = (searchParams.get("token") || "").trim();
  const lid = (searchParams.get("lid") || searchParams.get("linkId") || "").trim();

  // Ref yoksa hiçbir şey yapma (normal site davranışı)
  if (!token || token.length < 16 || !lid) return NextResponse.next();

  const origin = (process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get("host") || ""}`).trim();
  const ua = (req.headers.get("user-agent") || "unknown").slice(0, 512);
  const referer = (req.headers.get("referer") || "").slice(0, 2048);
  const slug = getSlugFromPath(pathname);

  // Cabo verify (bu çağrı click yazdıracak taraf)
  const v = await verifyWithCabo({ token, lid, slug, origin, ua, referer });

  // Verify başarısızsa: cookie yazma. İstersen burada cookie temizleyebilirsin.
  if (!v.ok) {
    // Hata sayfaya yansıtmak istemiyoruz; sessizce devam.
    // İstersen debug için header bas:
    const res = NextResponse.next();
    res.headers.set("x-cabo-verify", "fail");
    res.headers.set("x-cabo-verify-status", String(v.status));
    return res;
  }

  // Verify başarılı → cookie set et (sitewide/landing logic lib/discounter.ts bunu kullanacak)
  const ttlDays = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
  const maxAge = Number.isFinite(ttlDays) ? Math.max(1, ttlDays) * 24 * 60 * 60 : 14 * 24 * 60 * 60;
  const ts = Math.floor(Date.now() / 1000);

  // Landing mode için slug saklamak önemli (senin discounter.ts landing’de ref.slug ister)
  const cookiePayload = {
    token,
    lid,
    slug: slug || null,
    ts,
  };

  const res = NextResponse.next();
  res.cookies.set(REF_COOKIE, jsonCookie(cookiePayload), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  // Debug header (istersen sonra kaldırırsın)
  res.headers.set("x-cabo-verify", "ok");
  res.headers.set("x-cabo-lid", String(lid));
  return res;
}

// Her sayfada çalışsın (api/static hariç)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
