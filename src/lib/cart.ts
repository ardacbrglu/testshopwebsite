// src/lib/cart.ts
import { cookies } from "next/headers";
import { query } from "@/lib/db";

const COOKIE_NAME = "cartId";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 gün

interface MaxIdRow {
  id: number | null;
}

export async function getOrCreateCartId(): Promise<number> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return Number(existing);

  await query("INSERT INTO carts (email) VALUES (NULL)");
  const rows = (await query("SELECT MAX(id) AS id FROM carts")) as unknown as MaxIdRow[];
  const cid = rows[0]?.id ?? 0;

  store.set(COOKIE_NAME, String(cid), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
  });

  return Number(cid);
}

export async function getCartIdOptional(): Promise<number | null> {
  const store = await cookies();
  const cid = store.get(COOKIE_NAME)?.value;
  return cid ? Number(cid) : null;
}
