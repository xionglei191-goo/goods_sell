import { AddressManager } from "@/features/shop/AddressManager";
import { getAddresses } from "@/features/shop/queries";

export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const addresses = await getAddresses();

  return <AddressManager initialAddresses={addresses} />;
}
