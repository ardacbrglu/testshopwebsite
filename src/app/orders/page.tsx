"use client";

import { Suspense } from "react";
import OrdersClient from "./ui/OrdersClient";

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="text-sm text-neutral-400">Yükleniyor…</div>}>
      <OrdersClient />
    </Suspense>
  );
}
