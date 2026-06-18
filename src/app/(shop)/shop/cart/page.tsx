import type { Metadata } from "next";

import { CartClient } from "@/features/shop/CartClient";
import { getCartItems } from "@/features/shop/queries";

export const metadata: Metadata = {
  title: "购物车 | 华启商城",
};

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const items = await getCartItems();

  return <CartClient initialItems={items} />;
}
