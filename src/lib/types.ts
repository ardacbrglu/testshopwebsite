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
