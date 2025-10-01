// public/cabo-init.js
(() => {
  try {
    const search = new URLSearchParams(location.search);

    // 14 gün varsayılan (env'den de enjekte edilebilirsiniz)
    const DAYS = Number(window.__CABO_COOKIE_TTL_DAYS || 14);
    const MAX_AGE = DAYS * 24 * 60 * 60;
    const secure = location.protocol === "https:" ? "; Secure" : "";

    function setCookie(name, value, maxAgeSec = MAX_AGE) {
      document.cookie =
        `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
    }
    function getCookie(name) {
      return document.cookie
        .split(";")
        .map((s) => s.trim())
        .find((c) => c.startsWith(name + "="));
    }

    // query -> attrib
    const lid = search.get("lid") || search.get("cabo_lid");
    const wid = search.get("wid") || search.get("cabo_wid");
    const ref = search.get("ref") || search.get("cabo_ref");
    const ts = Math.floor(Date.now() / 1000);

    // landing slug (örn: /products/product-a -> product-a)
    let landingSlug = "";
    const m = location.pathname.match(/^\/products\/([^/]+)/i);
    if (m) landingSlug = m[1];

    // Attrib JSON (varsa güncelle, yoksa oluştur)
    let attrib = {};
    try {
      const ex = getCookie("cabo_attrib");
      if (ex) attrib = JSON.parse(decodeURIComponent(ex.split("=")[1])) || {};
    } catch { attrib = {}; }

    if (lid) attrib.lid = Number(lid);
    if (wid) attrib.wid = wid;
    if (ref) attrib.ref = ref;
    attrib.ts = ts;

    // yaz
    setCookie("cabo_attrib", JSON.stringify(attrib));
    if (lid) setCookie("cabo_lid", String(lid));
    if (wid) setCookie("cabo_wid", String(wid));
    if (landingSlug) setCookie("cabo_landing_slug", landingSlug);
    setCookie("cabo_seen_at", String(ts)); // son görüldü her yüklemede yenilenir

    // opsiyonel: pazarlama rızası (yoksa 1)
    if (!getCookie("consent_marketing")) setCookie("consent_marketing", "1");
  } catch (e) {
    // sessiz geç
    console && console.debug && console.debug("cabo-init error", e);
  }
})();
