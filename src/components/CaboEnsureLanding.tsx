"use client";

import { useEffect } from "react";

export default function CaboEnsureLanding(props: { slug: string; landing: boolean; ttlDays: number }) {
  const { slug, landing, ttlDays } = props;

  useEffect(() => {
    if (!landing) return;
    try {
      // mevcut oturumda bir wid varsa slug'ı garantiye al
      const wid = document.cookie.match(/(?:^|; )cabo_wid=([^;]+)/)?.[1];
      if (!wid) return;
      const maxAge = Math.max(60, Math.floor(ttlDays * 86400));
      document.cookie = `cabo_landing_slug=${encodeURIComponent(slug)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
      const now = Math.floor(Date.now() / 1000);
      document.cookie = `cabo_seen_at=${now}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
    } catch {}
  }, [slug, landing, ttlDays]);

  return null;
}
