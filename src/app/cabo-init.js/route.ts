export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readEnvClean(raw?: string | null): string {
  const v = raw ?? "";
  const noQuotes = v.replace(/^['"]|['"]$/g, "");
  const noInlineComment = noQuotes.replace(/\s+#.*$/, "");
  return noInlineComment.trim();
}

function invertMapForClient(): Record<string, string> {
  try {
    const txt = process.env.CABO_MAP_JSON || "{}";
    const map = JSON.parse(txt) as Record<string, { code: string; discount: string }>;
    const out: Record<string, string> = {};
    for (const slug of Object.keys(map)) {
      const code = map[slug]?.code;
      if (code) out[String(code)] = slug;
    }
    return out;
  } catch {
    return {};
  }
}

export async function GET() {
  const ttlDaysRaw = readEnvClean(process.env.CABO_COOKIE_TTL_DAYS);
  const ttlDays = Number(ttlDaysRaw);
  const ttlDaysSafe = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : 14;

  const scope = readEnvClean(process.env.CABO_ATTRIBUTION_SCOPE).toLowerCase() === "landing" ? "landing" : "sitewide";
  const codeToSlug = invertMapForClient();

  const js = `
  (function(){
    try{
      var url = new URL(window.location.href);
      var qp  = url.searchParams;

      var wid = qp.get("wid") || qp.get("token") || qp.get("ref") || qp.get("cabo") || qp.get("r") || "";
      var lid = qp.get("lid") || "";

      var secure = location.protocol === "https:";
      var ttlS   = ${ttlDaysSafe} * 24 * 60 * 60;

      function setCookie(k, v, maxAge){
        document.cookie = k + "=" + encodeURIComponent(v) +
          "; Max-Age=" + maxAge +
          "; Path=/" +
          "; SameSite=Lax" +
          (secure ? "; Secure" : "");
      }
      function getCookie(name){
        return (document.cookie.split(/;\\s*/).find(s => s.startsWith(name+"=")) || "").split("=").slice(1).join("=") || "";
      }
      function delParam(name){ if(qp.has(name)){ qp.delete(name); return true; } return false; }

      var changed = false;
      var hadWid  = getCookie("cabo_wid") !== "";

      // Parametre ile geldiyse wid'i yaz
      if(wid){
        var now = Math.floor(Date.now()/1000);
        setCookie("cabo_wid", wid, ttlS);
        setCookie("cabo_seen_at", String(now), ttlS);
        if(lid) setCookie("cabo_lid", lid, ttlS);
        setCookie("consent_marketing", "1", ttlS);

        if ("${scope}" === "landing") {
          var landingSlug = null;

          var m = location.pathname.match(/^\\/products\\/([^\\/?#]+)/i);
          if(m && m[1]) landingSlug = decodeURIComponent(m[1]);

          if(!landingSlug){
            var pslug = qp.get("slug") || qp.get("pslug");
            if(pslug) landingSlug = pslug;
          }

          if(!landingSlug){
            var code = qp.get("code");
            if(code){
              try{
                var table = ${JSON.stringify(codeToSlug)};
                if (table && table[code]) landingSlug = table[code];
              }catch(_e){}
            }
          }

          if(landingSlug){
            setCookie("cabo_landing_slug", landingSlug, ttlS);
          }
        }

        changed = delParam("wid") || changed;
        changed = delParam("token") || changed;
        changed = delParam("ref") || changed;
        changed = delParam("cabo") || changed;
        changed = delParam("r") || changed;
        changed = delParam("lid") || changed;
        changed = delParam("slug") || changed;
        changed = delParam("pslug") || changed;
        changed = delParam("code") || changed;
        changed = delParam("consent") || changed;

        if(changed){
          var clean = url.origin + url.pathname + (qp.toString()?("?"+qp.toString()):"") + url.hash;
          history.replaceState(null, "", clean);
          location.reload();
          return;
        }
      }

      // Ek sağlamlaştırma:
      // Landing modunda wid varsa ama landing_slug yoksa ve path /products/[slug] ise bir kez yaz.
      if ("${scope}" === "landing") {
        var hasWid = !!getCookie("cabo_wid");
        var hasLS  = !!getCookie("cabo_landing_slug");
        if (hasWid && !hasLS) {
          var m2 = location.pathname.match(/^\\/products\\/([^\\/?#]+)/i);
          if (m2 && m2[1]) {
            setCookie("cabo_landing_slug", decodeURIComponent(m2[1]), ttlS);
            location.reload();
            return;
          }
        }
      }
    }catch(_e){}
  })();
  `.trim();

  return new Response(js, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
