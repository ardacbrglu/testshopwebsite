export type Product = {
  id: number;
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  priceCents: number;
  isActive?: 0 | 1 | boolean;
  caboCode?: string | null;
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
  lineFinalCents?: number;
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
  createdAt: string; // ISO
  totalCents: number;
  items: ApiOrderItem[];
};

export type ApiCartResponse = {
  cartId: string;
  email?: string | null;
  items: ApiCartItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  referral?: { token?: string; linkId?: string; ts?: number } | null;
  orders?: ApiOrder[]; // e-posta varsa doldurulur
};
