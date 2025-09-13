// src/app/api/cabo/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Client'a güvenli şekilde yapılandırma vermek için küçük yardımcı endpoint.
 * NOT: Sırlar dönülmez!
 */
import { NextResponse } from "next/server";

function parseJSONSafe(src, fallback) {
  try { return JSON.parse(src || ""); } catch { return fallback; }
}

export async function GET() {
  const discounts = parseJSONSafe(process.env.CABO_DISCOUNTS_JSON, {});        // ör: {"a":"10%","b":"50TRY"}
  const productCodes = parseJSONSafe(process.env.CABO_PRODUCT_CODES_JSON, {}); // ör: {"a":"...uuid..."}
  // Sadece gerekli, sır olmayan alanları döndürüyoruz
  return NextResponse.json({
    discounts,
    productCodes,
    keyId: process.env.CABO_KEY_ID || null,
  }, { status: 200 });
}
