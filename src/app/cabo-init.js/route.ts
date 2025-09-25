// src/app/cabo-init.js/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

function safeB64Decode(b64: string): string | null {
  try { return Buffer.from(b64, "base64").toString("utf8"); } catch { return null; }
}

export async function GET() {
  const cookieStore = await cookies();
  const c = cookieStore.get("cabo_attrib")?.value || "";
  let wid = "";
  if (c.includes(".")) {
    const raw = c.split(".")[0];
    const body = safeB64Decode(raw);
    if (body) { try { wid = JSON.parse(body)?.wid || ""; } catch {} }
  }
  const js = `try{sessionStorage.setItem('cabo_wid', ${JSON.stringify(wid)});}catch(e){}`;
  return new NextResponse(js, {
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" }
  });
}
