// src/lib/db.js
import { getDiscountForLetter, applyDiscount } from "./discount.js";

const PRODUCT_CODES_RAW = process.env.CABO_PRODUCT_CODES_JSON || "{}";
/** { "a":"uuid...", "b":"uuid...", ... } */
let PRODUCT_CODES = {};
try { PRODUCT_CODES = JSON.parse(PRODUCT_CODES_RAW); } catch { PRODUCT_CODES = {}; }

export const CURRENCY = process.env.SHOP_CURRENCY || "TRY";

export const PRODUCTS = [
  { id: "a", slug: "product-a", name: "Product A", description: "Hafif, günlük kullanıma uygun demo ürün.", price: 229.99, image: "https://images.unsplash.com/photo-1512203492609-8f5b9a1a4d8f?q=80&w=1200&auto=format&fit=crop" },
  { id: "b", slug: "product-b", name: "Product B", description: "Dayanıklı ve şık demo ürün.", price: 49999.99, image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=1200&auto=format&fit=crop" },
  { id: "c", slug: "product-c", name: "Product C", description: "Kompakt boyut, yüksek performans.", price: 1999.99, image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=1200&auto=format&fit=crop" },
  { id: "d", slug: "product-d", name: "Product D", description: "Pratik, taşınabilir demo ürün.", price: 25000.0, image: "https://images.unsplash.com/photo-1511385348-a52b4a160dc2?q=80&w=1200&auto=format&fit=crop" },
  { id: "e", slug: "product-e", name: "Product E", description: "Günlük işlerin vazgeçilmezi.", price: 34.99, image: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop" },
  { id: "f", slug: "product-f", name: "Product F", description: "Uzun ömürlü, hesaplı çözüm.", price: 100000.0, image: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop" },
];

export function listProductsWithPricing(hasRef = false) {
  return PRODUCTS.map((p) => {
    const disc = hasRef ? getDiscountForLetter(p.id) : null;
    const priced = applyDiscount(p.price, disc);
    return {
      ...p,
      currency: CURRENCY,
      discount: disc ? { ...disc } : null,
      unitOriginal: priced.unitOriginal,
      unitFinal: priced.unitFinal,
      percentOff: priced.percentOff,
      discountLabel: priced.has ? priced.label : null,
      productCode: PRODUCT_CODES[p.id] || null,
      contracted: Boolean(PRODUCT_CODES[p.id]), // sözleşmeli ürün
    };
  });
}

export function getBySlug(slug, hasRef = false) {
  return listProductsWithPricing(hasRef).find((p) => p.slug === slug) || null;
}

export function getByLetter(letter, hasRef = false) {
  return listProductsWithPricing(hasRef).find((p) => p.id === letter) || null;
}

export function getProductCode(letter) {
  return PRODUCT_CODES[letter] || null;
}
