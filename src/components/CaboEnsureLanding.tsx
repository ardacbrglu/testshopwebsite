"use client";

import { useEffect } from "react";

type Props = { slug: string; landing: boolean; ttlDays: number };

export default function CaboEnsureLanding({ slug, landing, ttlDays }: Props) {
  useEffect(() => {
    if (!landing) return;

    const has = (name: string) => document.cookie.includes(name + "=");

    if (has("cabo_wid") && !has("cabo_landing_slug")) {
      const secure = location.protocol === "https:";
      const maxAge = Math.max(1, Math.floor(ttlDays)) * 24 * 60 * 60;
      document.cookie =
        "cabo_landing_slug=" +
        encodeURIComponent(slug) +
        "; Max-Age=" +
        String(maxAge) +
        "; Path=/" +
        "; SameSite=Lax" +
        (secure ? "; Secure" : "");
      // Tek seferlik yenile; SSR indirim aktif gelsin
      location.reload();
    }
  }, [slug, landing, ttlDays]);

  return null;
}
