"use client";

import OrdersClient from "./ui/OrdersClient";

export default function OrdersPage() {
  // OrdersClient kendi içinde localStorage'dan okuyor.
  return <OrdersClient />;
}
