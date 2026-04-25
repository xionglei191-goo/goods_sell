import { CartClient } from "@/features/shop/CartClient";
import { getCartItems } from "@/features/shop/queries";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const items = await getCartItems();

  return <CartClient initialItems={items} />;
}
