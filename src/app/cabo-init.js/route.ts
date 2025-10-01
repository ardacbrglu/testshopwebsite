// Tiny JS boot: URL'deki token/lid'yi cookie'ye yazar.
// <script src="/cabo-init.js" async defer></script> ile her sayfada çalışır.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readEnvClean(v?: string | null) {
  const raw = v ?? "";
  return raw.replace(/^['"]|['"]$/g, "").replace(/\s+#.*$/, "").trim();
}
function ttlDays() {
  const n = Number(readEnvClean(process.env.CABO_COOKIE_TTL_DAYS));
  return Number.isFinite(n) && n > 0 ? n : 14;
}

export async function GET() {
  const maxAge = ttlDays() * 86400;

  const js = `
(function(){
  try{
    var q = new URLSearchParams(location.search);
    var wid = q.get("token") || q.get("wid") || "";
    var lid = q.get("lid") || q.get("link") || q.get("l") || "";
    var now = Math.floor(Date.now()/1000);
    var path = location.pathname.split("/");
    var slugGuess = path.length >= 3 && path[1]==="products" ? path[2] : "";

    function setCookie(k,v){
      if(!v) return;
      document.cookie = k + "=" + encodeURIComponent(v)
        + "; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure";
    }

    if (wid) setCookie("cabo_wid", wid);
    if (lid) setCookie("cabo_lid", lid);
    if (wid || lid) setCookie("cabo_seen_at", String(now));

    // Landing modunda slug eşleşmesi için
    if (slugGuess) setCookie("cabo_landing_slug", slugGuess);
  }catch(e){}
})();`;

  return new NextResponse(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
