// src/lib/types.ts

/**
 * Core shared types (UI + API + DB mapping)
 * - UI tarafında ProductCard / Product pages bu Product tipini kullanır (camelCase).
 * - DB'den gelen cart JOIN sonucu RawCartRow'dur (camelCase).
 * - API dönüşlerinde Cart / Orders tipleri ApiCartItem / ApiOrder olarak kullanılır.
 */

export type Product = {
  id: number;
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  priceCents: number;
  isActive?: boolean | number | null;
  caboCode?: string | null;
};

/**
 * DB join çıktısı (cart_items + products)
 * ÖNEMLİ: queries.ts içindeki SELECT alias'ları bununla uyumlu olmalı:
 * - ci.product_id   AS productId
 * - p.image_url     AS imageUrl (veya alias)
 * - ci.unit_price_cents AS unitPriceCents
 */
export type RawCartRow = {
  productId: number;
  slug: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceCents: number;
};

export type ApiCartItem = {
  productId: number;
  slug: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceCents: number;
  discountPct: number;
  finalUnitPriceCents: number;
  lineFinalCents: number;
};

export type ApiOrderItem = {
  productId: number | null;
  slug: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceCents: number;
  finalUnitPriceCents: number;
  lineFinalCents: number;
};

export type ApiOrder = {
  id: number;
  createdAt: string;
  totalCents: number;
  items: ApiOrderItem[];
};
