// src/lib/queries.ts
import { query } from "./db";
import { newId } from "./id";
import type { Product, RawCartRow, ApiCartItem, ApiOrder, ApiOrderItem } from "./types";

/* helpers */
type Row = Record<string, unknown>;
const normEmail = (e: string) => String(e || "").trim().toLowerCase();

async function listColumns(table: string): Promise<string[]> {
  const rows = (await query(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  )) as unknown as Array<{ name: string }>;
  return (rows || []).map((r) => String(r.name));
}
function pick(cols: string[], re: RegExp) {
  return cols.find((c) => re.test(c)) || null;
}

/* schema: yalnızca bizim tabloları garanti ediyoruz */
let schemaOk = false;
async function ensureSchema() {
  if (schemaOk) return;

  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL,
      image_url TEXT NULL,
      price_cents INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      product_code VARCHAR(255) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const pcount = (await query(`SELECT COUNT(*) AS c FROM products`)) as unknown as Array<{ c?: number }>;
  const c = Number(pcount?.[0]?.c ?? 0);
  if (c === 0) {
    await query(
      `INSERT INTO products (slug, name, description, image_url, price_cents, is_active, product_code)
       VALUES
       ('product-a','Product A','Demo product A','',4999999,1,NULL),
       ('product-b','Product B','Demo product B','',1999999,1,NULL),
       ('product-c','Product C','Demo product C','',999999,1,NULL),
       ('product-d','Product D','Demo product D','',1499999,1,NULL),
       ('product-e','Product E','Demo product E','',2999999,1,NULL)`
    );
  }

  await query(`
    CREATE TABLE IF NOT EXISTS cart_emails (
      cart_id VARCHAR(64) PRIMARY KEY,
      email   VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cart_id VARCHAR(64) NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      unit_price_cents INT NOT NULL DEFAULT 0,
      UNIQUE KEY uniq_item (cart_id, product_id),
      INDEX idx_cart (cart_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      total_cents INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT NULL,
      slug VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      image_url TEXT NULL,
      quantity INT NOT NULL,
      unit_price_cents INT NOT NULL,
      final_unit_price_cents INT NOT NULL,
      line_final_cents INT NOT NULL,
      INDEX idx_order (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  schemaOk = true;
}

/* product SELECT cache */
type PSel = { allSql: string; bySlugSql: string; cartJoinSql: string };
let selCache: PSel | null = null;

async function buildProductSelect(): Promise<PSel> {
  if (selCache) return selCache;
  const cols = await listColumns("products");

  const imgCol =
    pick(cols, /^(image_url|imageUrl|img_url|imageURL)$/i) ||
    pick(cols, /(image|img|photo|picture)/i);

  const descCol = pick(cols, /^(description|desc|details|aciklama)$/i) || null;
  const activeCol = pick(cols, /^(is_active|isActive|active)$/i) || null;
  const codeCol = pick(cols, /^(product_code|caboCode|code)$/i) || null;

  const centsCol =
    pick(cols, /(cent|cents|kurus)$/i) ||
    pick(cols, /^price_cents$/i) ||
    pick(cols, /^priceCents$/i);

  const tlCol = pick(cols.filter((c) => !/(cent|cents|kurus)/i.test(c)), /(price|fiyat|amount|tl)/i);

  const imgExpr = imgCol ? `\`${imgCol}\`` : `''`;
  const descExpr = descCol ? `\`${descCol}\`` : `''`;
  const actExpr = activeCol ? `\`${activeCol}\`` : `1`;
  const codeExpr = codeCol ? `\`${codeCol}\`` : `NULL`;
  const priceExpr = centsCol ? `\`${centsCol}\`` : tlCol ? `ROUND(\`${tlCol}\` * 100)` : `0`;

  const base = `
    id, slug, name,
    ${descExpr}  AS description,
    ${imgExpr}   AS imageUrl,
    ${priceExpr} AS priceCents,
    ${actExpr}   AS isActive,
    ${codeExpr}  AS caboCode
  `;

  const whereActive = activeCol ? ` WHERE \`${activeCol}\` = 1` : ``;

  const allSql = `SELECT ${base} FROM products${whereActive} ORDER BY id ASC`;
  const bySlugSql = `SELECT ${base} FROM products WHERE slug = ? LIMIT 1`;

  // ✅ CART JOIN: snake_case DB -> biz burada SELECT alias ile camelCase döndürüyoruz
  const cartJoinSql = `
    SELECT
      ci.product_id AS productId,
      p.slug        AS slug,
      p.name        AS name,
      ${imgCol ? `p.\`${imgCol}\`` : `''`} AS imageUrl,
      ci.quantity   AS quantity,
      ci.unit_price_cents AS unitPriceCents
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ?
    ORDER BY ci.id ASC
  `;

  selCache = { allSql, bySlugSql, cartJoinSql };
  return selCache;
}

/* cart helpers */
export async function ensureCartId(cartId?: string | null) {
  await ensureSchema();
  return cartId || newId();
}

export async function setCartEmail(cartId: string, email: string) {
  await ensureSchema();
  const e = normEmail(email);
  await query(
    `INSERT INTO cart_emails (cart_id, email)
     VALUES (?, ?) ON DUPLICATE KEY UPDATE email = VALUES(email)`,
    [cartId, e]
  );
}

export async function getCartEmail(cartId: string): Promise<string | null> {
  await ensureSchema();
  const r = (await query(`SELECT email FROM cart_emails WHERE cart_id = ?`, [cartId])) as unknown as Array<{ email?: string }>;
  const e = r?.[0]?.email;
  return e ? normEmail(e) : null;
}

export async function addCartItem(opts: { cartId: string; productId: number; quantity: number }) {
  await ensureSchema();
  const { cartId, productId, quantity } = opts;

  const pcols = await listColumns("products");
  const centsCol =
    pick(pcols, /(cent|cents|kurus)$/i) || pick(pcols, /^price_cents$/i) || pick(pcols, /^priceCents$/i);
  const tlCol = pick(pcols.filter((c) => !/(cent|cents|kurus)/i.test(c)), /(price|fiyat|amount|tl)/i);
  const priceSel = centsCol ? `\`${centsCol}\`` : tlCol ? `ROUND(\`${tlCol}\` * 100)` : `0`;

  const rows = (await query(
    `SELECT ${priceSel} AS unit_price_cents FROM products WHERE id = ?`,
    [productId]
  )) as unknown as Array<{ unit_price_cents?: number }>;

  const unit = Number(rows?.[0]?.unit_price_cents ?? 0);

  await query(
    `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price_cents)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       quantity = quantity + VALUES(quantity),
       unit_price_cents = VALUES(unit_price_cents)`,
    [cartId, productId, Math.max(1, Number(quantity) || 1), Math.max(0, unit)]
  );
}

export async function setItemQuantity(opts: { cartId: string; productId: number; quantity: number }) {
  await ensureSchema();
  const { cartId, productId, quantity } = opts;
  if (quantity <= 0) {
    await query(`DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?`, [cartId, productId]);
    return;
  }
  await query(
    `UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?`,
    [quantity, cartId, productId]
  );
}

export async function removeItem(cartId: string, productId: number) {
  await ensureSchema();
  await query(`DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?`, [cartId, productId]);
}

export async function getCartItems(cartId: string): Promise<RawCartRow[]> {
  await ensureSchema();
  const sel = await buildProductSelect();

  const rows = (await query(sel.cartJoinSql, [cartId])) as unknown as Array<{
    productId: number;
    slug: string;
    name: string;
    imageUrl: string;
    quantity: number;
    unitPriceCents: number;
  }>;

  // ✅ camelCase output
  return (rows || []).map((r) => ({
    productId: Number(r.productId),
    slug: String(r.slug),
    name: String(r.name),
    imageUrl: String(r.imageUrl || ""),
    quantity: Number(r.quantity),
    unitPriceCents: Number(r.unitPriceCents),
  }));
}
export const getCartItemsRaw = getCartItems;

export async function clearCart(cartId: string) {
  await ensureSchema();
  await query(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);
}

/* products */
export async function getAllProducts(): Promise<Product[]> {
  await ensureSchema();
  const sel = await buildProductSelect();
  const rows = (await query(sel.allSql)) as unknown as Row[];

  return (rows || []).map((r) => ({
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
    description: String((r.description as string) || ""),
    imageUrl: String((r.imageUrl as string) || ""),
    priceCents: Number((r.priceCents as number) ?? 0),
    isActive: (r.isActive as any) ?? null,
    caboCode: (r.caboCode as any) ?? null,
  }));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  await ensureSchema();
  const sel = await buildProductSelect();
  const rows = (await query(sel.bySlugSql, [slug])) as unknown as Row[];
  const r = rows?.[0];
  if (!r) return null;

  return {
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
    description: String((r.description as string) || ""),
    imageUrl: String((r.imageUrl as string) || ""),
    priceCents: Number((r.priceCents as number) ?? 0),
    isActive: (r.isActive as any) ?? null,
    caboCode: (r.caboCode as any) ?? null,
  };
}

/* orders */
export async function recordOrder(email: string, items: ApiCartItem[], totalCents: number) {
  await ensureSchema();
  const e = normEmail(email);

  const insUnknown = await query(
    `INSERT INTO orders (email, total_cents) VALUES (?, ?)`,
    [e, Number(totalCents) || 0]
  );
  const ins = insUnknown as unknown as { insertId?: number };
  const orderId = Number(ins?.insertId ?? 0);
  if (!orderId) throw new Error("ORDER_INSERT_FAILED");

  if (items.length) {
    const ph = items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const vals: unknown[] = [];
    for (const it of items) {
      vals.push(
        orderId,
        it.productId ?? null,
        it.slug,
        it.name,
        it.imageUrl || "",
        it.quantity,
        it.unitPriceCents,
        it.finalUnitPriceCents,
        it.finalUnitPriceCents * it.quantity
      );
    }
    await query(
      `INSERT INTO order_items
       (order_id, product_id, slug, name, image_url, quantity, unit_price_cents, final_unit_price_cents, line_final_cents)
       VALUES ${ph}`,
      vals
    );
  }

  return orderId;
}

export async function getOrdersByEmail(email: string): Promise<ApiOrder[]> {
  await ensureSchema();
  const e = normEmail(email);

  const orders = (await query(
    `SELECT id, total_cents AS totalCents, created_at AS createdAt
     FROM orders WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 20`,
    [e]
  )) as unknown as Array<{ id: number; totalCents?: number; createdAt: string }>;

  if (!orders.length) return [];

  const ids = orders.map((o) => Number(o.id));
  const inList = ids.map(() => "?").join(", ");

  const items = (await query(
    `SELECT
        order_id AS orderId,
        product_id AS productId,
        slug, name,
        image_url AS imageUrl,
        quantity,
        unit_price_cents AS unitPriceCents,
        final_unit_price_cents AS finalUnitPriceCents,
        line_final_cents AS lineFinalCents
     FROM order_items
     WHERE order_id IN (${inList})
     ORDER BY id ASC`,
    ids
  )) as unknown as Array<{
    orderId: number;
    productId: number | null;
    slug: string;
    name: string;
    imageUrl: string | null;
    quantity: number;
    unitPriceCents: number;
    finalUnitPriceCents: number;
    lineFinalCents: number;
  }>;

  const byOrder: Record<number, ApiOrderItem[]> = {};
  for (const r of items) {
    (byOrder[r.orderId] ||= []).push({
      productId: r.productId ?? null,
      slug: r.slug,
      name: r.name,
      imageUrl: r.imageUrl || "",
      quantity: r.quantity,
      unitPriceCents: r.unitPriceCents,
      finalUnitPriceCents: r.finalUnitPriceCents,
      lineFinalCents: r.lineFinalCents,
    });
  }

  return orders.map((o) => ({
    id: o.id,
    createdAt: new Date(String(o.createdAt)).toISOString(),
    totalCents: Number(o.totalCents ?? 0),
    items: byOrder[o.id] || [],
  }));
}
