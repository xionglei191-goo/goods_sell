import { ShopShell } from "@/features/shop/ShopShell";
import { getShopLayoutData } from "@/features/shop/queries";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const { user, cartCount } = await getShopLayoutData();

  return (
    <ShopShell cartCount={cartCount} user={user}>
      {children}
    </ShopShell>
  );
}
