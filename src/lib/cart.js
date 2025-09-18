// src/lib/cart.js
import { cookies } from "next/headers";
import { query } from "@/lib/db";

export async function getCartIdOptional() {
  const c = await cookies();
  const raw = c.get("cart_id")?.value;
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

export async function getOrCreateCart() {
  const c = await cookies();
  const existing = c.get("cart_id")?.value;
  if (existing && /^\d+$/.test(existing)) return { id: parseInt(existing,10) };
  const ins = await query("INSERT INTO carts () VALUES ()");
  const id = ins.insertId;
  c.set("cart_id", String(id), { httpOnly:true, sameSite:"Lax", secure:true, path:"/" });
  return { id };
}

export async function attachEmailToCart(cartId, email) {
  await query("UPDATE carts SET email=? WHERE id=?", [email, cartId]);
  await query("INSERT IGNORE INTO customers (email) VALUES (?)", [email]);
}
