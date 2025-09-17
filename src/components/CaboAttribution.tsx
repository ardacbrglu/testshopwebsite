// src/components/CaboAttribution.tsx
"use client";

import { useEffect } from "react";

/**
 * ?token=... parametresini yakalar ve cookie'ye yazar.
 * Ürün detayındaysa landing slug bilgisini de ekler.
 * İlk ekranda indirimleri gösterebilmek için sessionStorage'a preview bayrağı bırakır.
 */
export default function CaboAttribution() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const token = url.searchParams.get("token");
      if (!token) return;

      const m = /^\/products\/([^/]+)$/.exec(url.pathname);
      const slug = m ? m[1] : "";

      sessionStorage.setItem("cabo_preview", "1");

      const qs = new URLSearchParams({ token, slug });
      fetch(`/api/cabo-attribution?${qs}`, { method: "POST", cache: "no-store" }).catch(() => {});
    } catch {}
  }, []);

  return null;
}
