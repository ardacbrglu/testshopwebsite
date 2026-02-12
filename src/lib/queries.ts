import { query } from "./db";
import { newId } from "./id";
import type { Product, ApiOrder, ApiOrderItem } from "./types";
import type { RawCartRow, ApiCartItem } from "./discounter";

/* helpers */
type Row = Record<string, unknown>;
const normEmail = (e: string) => String(e || "").trim().toLowerCase();

async function listColumns(table: string): Promise<string[]> {
  const rows = (await query(
    `SELECT column_name AS name
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  )) as unknown as Array<{ name: string }>;
  return (rows || []).map((r) => String(r.name));
}

function pick(cols: string[], re: RegExp) {
  return cols.find((c) => re.test(c)) || null;
}

type CartsIdInfo = {
  exists: boolean;
  dataType: string;     // int, bigint, varchar, ...
  columnType: string;   // int(11), varchar(64), ...
  isAutoInc: boolean;
};

async function getCartsIdInfo(): Promise<CartsIdInfo> {
  const rows = (await query(
    `SELECT data_type AS dataType, column_type AS columnType, extra AS extraInfo
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'carts'
       AND column_name = 'id'
     LIMIT 1`
  )) as unknown as Array<{ dataType: string; columnType: string; extraInfo: string | null }>;

  const r = rows?.[0];
  if (!r) {
    return { exists: false, dataType: "", columnType: "", isAutoInc: false };
  }
  const extra = String(r.extraInfo || "").toLowerCase();
  return {
    exists: true,
    dataType: String(r.dataType || "").toLowerCase(),
    columnType: String(r.columnType || "").toLowerCase(),
    isAutoInc: extra.includes("auto_increment"),
  };
}

function isNumericType(dt: string) {
  return ["int", "bigint", "mediumint", "smallint", "tinyint", "decimal", "numeric"].includes(dt);
}
function isStringType(dt: string) {
  return ["varchar", "char", "text", "mediumtext", "longtext"].includes(dt);
}

/* schema: yalnızca bizim tabloları garanti ediyoruz */
let schemaOk = false;

async function ensureSchema() {
  if (schemaOk) return;

  // carts var mı? yoksa minimal bir carts yarat (string id ile)
  const cartsCols = await listColumns("carts").catch(() => []);
  if (!cartsCols.length) {
    await query(`
      CREATE TABLE IF NOT EXISTS carts (
        id VARCHAR(64) PRIMARY KEY
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  // carts.id tipini öğren, child tabloları ona göre yarat
  const idInfo = await getCartsIdInfo();

  // Eğer information_schema carts.id görmüyorsa, yine de varsayılan varchar(64) ile devam et
  const cartIdColType = idInfo.exists ? idInfo.columnType : "varchar(64)";

  await query(`
    CREATE TABLE IF NOT EXISTS cart_emails (
      cart_id ${cartIdColType} PRIMARY KEY,
      email   VARCHAR(255) NOT NULL,
      CONSTRAINT fk_cart_emails_cart
        FOREIGN KEY (cart_id) REFERENCES carts (id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cart_id ${cartIdColType} NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      unit_price_cents INT NOT NULL DEFAULT 0,
      UNIQUE KEY uniq_item (cart_id, product_id),
      INDEX idx_cart (cart_id),
      CONSTRAINT fk_cart_items_cart
        FOREIGN KEY (cart_id) REFERENCES carts (id)
        ON DELETE CASCADE ON UPDATE CASCADE
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

  const imgCol = pick(cols, /^(image_url|imageUrl|img_url|imageURL)$/i) || pick(cols, /(image|img|photo|picture)/i);
  const descCol = pick(cols, /^(description|desc|details|aciklama)$/i) || null;
  const activeCol = pick(cols, /^(is_active|isActive|active)$/i) || null;
  const codeCol = pick(cols, /^(product_code|caboCode|code)$/i) || null;

  const centsCol = pick(cols, /(cent|cents|kurus)$/i) || pick(cols, /^price_cents$/i) || pick(cols, /^priceCents$/i);
  const tlCol = pick(cols.filter((c) => !/(cent|cents|kurus)/i.test(c)), /(price|fiyat|amount|tl)/i);

  const imgExpr = imgCol ? `\`${imgCol}\`` : `''`;
  const descExpr = descCol ? `\`${descCol}\`` : `''`;
  const actExpr = activeCol ? `\`${activeCol}\`` : `1`;
  const codeExpr = codeCol ? `\`${codeCol}\`` : `NULL`;
  const priceExpr = centsCol ? `\`${centsCol}\`` : (tlCol ? `ROUND(\`${tlCol}\` * 100)` : `0`);

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

  const imgJoin = imgCol ? `p.\`${imgCol}\`` : `''`;
  const cartJoinSql = `
    SELECT ci.product_id, p.slug, p.name, ${imgJoin} AS image_url,
           ci.quantity, ci.unit_price_cents
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = ?
     ORDER BY ci.id ASC
  `;

  selCache = { allSql, bySlugSql, cartJoinSql };
  return selCache;
}

/* carts: DB'ye göre id üret */
async function cartExists(cartId: string): Promise<boolean> {
  const rows = (await query(`SELECT id FROM carts WHERE id = ? LIMIT 1`, [cartId])) as unknown as Array<{ id?: unknown }>;
  return !!rows?.[0]?.id;
}

async function createCart(): Promise<string> {
  await ensureSchema();
  const idInfo = await getCartsIdInfo();

  // Eğer auto_increment ise dene
  if (idInfo.exists && idInfo.isAutoInc) {
    const ins = (await query(`INSERT INTO carts () VALUES ()`)) as unknown as { insertId?: number };
    const insertId = Number(ins?.insertId ?? 0);
    if (insertId > 0) return String(insertId);
    // auto_inc var sanıp insertId alamazsak fallback aşağıya düşsün
  }

  // Auto increment değilse: tipine göre id üret
  if (!idInfo.exists || isStringType(idInfo.dataType)) {
    const id = newId();
    await query(`INSERT INTO carts (id) VALUES (?)`, [id]);
    return id;
  }

  if (isNumericType(idInfo.dataType)) {
    const r = (await query(`SELECT COALESCE(MAX(id), 0) + 1 AS nid FROM carts`)) as unknown as Array<{ nid?: unknown }>;
    const nid = Number(r?.[0]?.nid ?? 0);
    if (!Number.isFinite(nid) || nid <= 0) {
      // son çare
      const id = newId();
      await query(`INSERT INTO carts (id) VALUES (?)`, [id]);
      return id;
    }
    await query(`INSERT INTO carts (id) VALUES (?)`, [nid]);
    return String(nid);
  }

  // bilinmeyen tip: string id ile dene
  const id = newId();
  await query(`INSERT INTO carts (id) VALUES (?)`, [id]);
  return id;
}

/* cart helpers */
export async function ensureCartId(cartId?: string | null) {
  await ensureSchema();

  const cid = cartId ? String(cartId) : "";
  if (cid) {
    const ok = await cartExists(cid);
    if (ok) return cid;
  }
  return await createCart();
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

  // ✅ FK güvenliği: cart gerçekten var mı?
  const ok = await cartExists(String(cartId));
  if (!ok) {
    // cookie stale ise route tekrar ensureCartId çağırıp cookie’yi düzeltmeli
    throw new Error("STALE_CART_ID");
  }

  const pcols = await listColumns("products");
  const centsCol = pick(pcols, /(cent|cents|kurus)$/i) || pick(pcols, /^price_cents$/i) || pick(pcols, /^priceCents$/i);
  const tlCol = pick(pcols.filter((c) => !/(cent|cents|kurus)/i.test(c)), /(price|fiyat|amount|tl)/i);
  const priceSel = centsCol ? `\`${centsCol}\`` : (tlCol ? `ROUND(\`${tlCol}\` * 100)` : `0`);

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
    [cartId, productId, Number(quantity) || 1, unit]
  );
}

export async function setItemQuantity(opts: { cartId: string; productId: number; quantity: number }) {
  await ensureSchema();
  const { cartId, productId, quantity } = opts;
  if (quantity <= 0) {
    await query(`DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?`, [cartId, productId]);
    return;
  }
  await query(`UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?`,
    [quantity, cartId, productId]);
}

export async function removeItem(cartId: string, productId: number) {
  await ensureSchema();
  await query(`DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?`, [cartId, productId]);
}

export async function getCartItems(cartId: string) {
  await ensureSchema();
  const sel = await buildProductSelect();
  const rows = (await query(sel.cartJoinSql, [cartId])) as unknown as Row[];
  return rows.map((r) => ({
    product_id: Number(r.product_id),
    slug: String(r.slug),
    name: String(r.name),
    image_url: (r.image_url as string) || "",
    quantity: Number(r.quantity),
    unit_price_cents: Number(r.unit_price_cents),
  })) as RawCartRow[];
}
export const getCartItemsRaw = getCartItems;

export async function clearCart(cartId: string) {
  await ensureSchema();
  await query(`DELETE FROM cart_items WHERE cart_id = ?`, [cartId]);
}

/* products */
export async function getAllProducts(): Promise<Product[]> {
  const sel = await buildProductSelect();
  const rows = (await query(sel.allSql)) as unknown as Row[];
  return rows.map((r) => ({
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
    description: (r.description as string) || "",
    imageUrl: (r.imageUrl as string) || "",
    priceCents: Number(r.priceCents ?? (r as Row).pricecents ?? (r as Row).price_cents ?? 0),
    isActive: (r.isActive as boolean | number | null) ?? null,
    caboCode: (r.caboCode as string | null) ?? null,
  }));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const sel = await buildProductSelect();
  const rows = (await query(sel.bySlugSql, [slug])) as unknown as Row[];
  const r = rows?.[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
    description: (r.description as string) || "",
    imageUrl: (r.imageUrl as string) || "",
    priceCents: Number(r.priceCents ?? (r as Row).pricecents ?? (r as Row).price_cents ?? 0),
    isActive: (r.isActive as boolean | number | null) ?? null,
    caboCode: (r.caboCode as string | null) ?? null,
  };
}

/* orders */
async function pickOrderCols() {
  const cols = await listColumns("orders");
  const totalCol =
    pick(cols, /^total_cents$/i) ||
    pick(cols, /(amount_cents|grand_total_cents)$/i) ||
    pick(cols, /^grandTotalCents$/) ||
    pick(cols, /^subtotalCents$/) ||
    pick(cols, /^total$/i) ||
    pick(cols, /^amount$/i) ||
    null;

  const createdCol =
    pick(cols, /^created_at$/i) ||
    pick(cols, /^createdAt$/) ||
    pick(cols, /^created$/i) ||
    pick(cols, /(timestamp|ts)$/i) ||
    null;

  return { cols, totalCol, createdCol };
}

export async function recordOrder(email: string, items: ApiCartItem[], totalCents: number) {
  await ensureSchema();
  const e = normEmail(email);

  const subtotal = items.reduce((s, it) => s + it.unitPriceCents * it.quantity, 0);
  const discountTotal = Math.max(0, subtotal - totalCents);

  const { cols, totalCol } = await pickOrderCols();
  const insertCols: string[] = ["email"];
  const values: unknown[] = [e];
  const placeholders: string[] = ["?"];

  if (totalCol) { insertCols.push(`\`${totalCol}\``); placeholders.push("?"); values.push(totalCents); }

  if (cols.includes("orderNumber")) { insertCols.push("orderNumber"); placeholders.push("?"); values.push(`TS-${Date.now()}-${Math.floor(Math.random()*1e6)}`); }
  if (cols.includes("currency"))    { insertCols.push("currency");    placeholders.push("?"); values.push("TRY"); }
  if (cols.includes("subtotalCents"))      { insertCols.push("subtotalCents");      placeholders.push("?"); values.push(subtotal); }
  if (cols.includes("discountTotalCents")) { insertCols.push("discountTotalCents"); placeholders.push("?"); values.push(discountTotal); }
  if (cols.includes("grandTotalCents"))    { insertCols.push("grandTotalCents");    placeholders.push("?"); values.push(totalCents); }

  const insUnknown = await query(
    `INSERT INTO orders (${insertCols.join(", ")}) VALUES (${placeholders.join(", ")})`,
    values
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
  const { totalCol, createdCol } = await pickOrderCols();
  const totalExpr = totalCol ? `\`${totalCol}\`` : `0`;
  const createdExpr = createdCol ? `\`${createdCol}\`` : `NOW()`;

  const orders = (await query(
    `SELECT id, ${totalExpr} AS total_cents, ${createdExpr} AS created_at
     FROM orders WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 20`,
    [e]
  )) as unknown as Array<{ id: number; total_cents?: number; created_at: string }>;

  if (!orders.length) return [];

  const ids = orders.map((o) => Number(o.id));
  const inList = ids.map(() => "?").join(", ");
  const items = (await query(
    `SELECT order_id, product_id, slug, name, image_url, quantity, unit_price_cents,
            final_unit_price_cents, line_final_cents
     FROM order_items WHERE order_id IN (${inList}) ORDER BY id ASC`,
    ids
  )) as unknown as Array<{
    order_id: number;
    product_id: number | null;
    slug: string;
    name: string;
    image_url: string | null;
    quantity: number;
    unit_price_cents: number;
    final_unit_price_cents: number;
    line_final_cents: number;
  }>;

  const byOrder: Record<number, ApiOrderItem[]> = {};
  for (const r of items) {
    (byOrder[r.order_id] ||= []).push({
      productId: r.product_id ?? null,
      slug: r.slug,
      name: r.name,
      imageUrl: r.image_url || "",
      quantity: r.quantity,
      unitPriceCents: r.unit_price_cents,
      finalUnitPriceCents: r.final_unit_price_cents,
      lineFinalCents: r.line_final_cents,
    });
  }

  return orders.map((o) => {
    const its = byOrder[o.id] || [];
    const computedTotal = its.reduce((s, it) => s + Number(it.lineFinalCents || 0), 0);
    return {
      id: o.id,
      createdAt: new Date(String(o.created_at)).toISOString(),
      totalCents: o.total_cents ?? computedTotal,
      items: its,
    };
  });
}
