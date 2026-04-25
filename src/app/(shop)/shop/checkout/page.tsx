import { CheckoutClient } from "@/features/shop/CheckoutClient";
import { getCheckoutData } from "@/features/shop/queries";
import { splitParam } from "@/features/shop/utils";

export const dynamic = "force-dynamic";

type CheckoutPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const itemIds = splitParam(params.items);
  const data = await getCheckoutData(itemIds);

  return <CheckoutClient data={data} />;
}
