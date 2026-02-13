import { NextRequest, NextResponse } from "next/server";

const REF_COOKIE = "cabo_attrib";

function stripParams(url: URL) {
  // token/lid/slug gibi attribution paramlarını temizle
  url.searchParams.delete("token");
  url.searchParams.delete("lid");
  url.searchParams.delete("slug");
  url.searchParams.delete("caboRef");
  url.searchParams.delete("caboToken");
  url.searchParams.delete("caboLid");
  return url;
}

function jsonCookieValue(input: unknown) {
  return JSON.stringify(input);
}

async function verifyWithCabo(args: {
  token: string;
  lid?: string | null;
  slug?: string | null;
}): Promise<boolean> {
  const verifyUrl = (process.env.CABO_VERIFY_URL || "").trim();
  if (!verifyUrl) return false; // verify zorunlu

  const u = new URL(verifyUrl);
  u.searchParams.set("token", args.token);
  if (args.lid) u.searchParams.set("lid", String(args.lid));
  if (args.slug) u.searchParams.set("slug", String(args.slug));

  try {
    const r = await fetch(u.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!r.ok) return false;

    // Bazı verify endpoint’ler JSON döner: { ok:true, valid:true }
    // Bazıları sadece 200 döner. İkisini de destekleyelim.
    let j: any = null;
    try {
      j = await r.json();
    } catch {
      j = null;
    }
    if (!j) return true;
    if (j.ok === true && (j.valid === true || j.verified === true || j.allowed === true)) return true;
    if (j.ok === true && j.valid == null) return true; // ok:true ama valid yoksa da kabul
    return j.valid === true;
  } catch {
    return false;
  }
}

async function pingCaboClick(token: string, lid?: string | null) {
  // Cabo click log sadece /api/ref/[token] ile oluyor.
  // Biz bunu background ping gibi yapacağız; redirect’i manual yapıp sayfa navigasyonunu bozmayacağız.
  const base = (process.env.CABO_CLICK_BASE_URL || "").trim();
  if (!base) return;

  try {
    const u = new URL(base.replace(/\/+$/, "") + `/api/ref/${encodeURIComponent(token)}`);
    if (lid) u.searchParams.set("lid", String(lid));

    // redirect: "manual" => 302’yi takip etmez, ama Cabo endpoint request’i aldığı için click yazılabilir.
    await fetch(u.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { "User-Agent": "testshop-attrib-ping" },
    }).catch(() => {});
  } catch {
    // ignore
  }
}

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);

  // sadece token paramı varsa attribution akışı çalışsın
  const token = url.searchParams.get("token") || url.searchParams.get("caboRef") || url.searchParams.get("caboToken");
  const lid = url.searchParams.get("lid") || url.searchParams.get("caboLid");
  const slug = url.searchParams.get("slug");

  if (!token) return NextResponse.next();

  const ok = await verifyWithCabo({ token, lid, slug });

  const cleanUrl = stripParams(new URL(req.url));

  // URL’yi temizleyip redirect edeceğiz, aynı anda cookie set/clear yapacağız.
  const res = NextResponse.redirect(cleanUrl.toString(), 302);

  if (!ok) {
    // invalid => cookie sil
    res.cookies.set(REF_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  // valid => cookie set (verified flag + ts)
  const ttlDays = Number(process.env.CABO_COOKIE_TTL_DAYS || 14);
  const maxAge = Math.max(1, Math.round(ttlDays * 24 * 60 * 60));

  const payload = {
    token,
    lid: lid ?? null,
    slug: slug ?? null,
    ts: Math.floor(Date.now() / 1000),
    v: 1, // ✅ verified flag
  };

  res.cookies.set(REF_COOKIE, jsonCookieValue(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  // click ping (await edelim; kısa)
  await pingCaboClick(token, lid);

  return res;
}

// token paramı olan tüm sayfalarda çalışsın
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
