import { CatalogBrowser } from "@/features/shop/CatalogBrowser";
import { getCatalogData } from "@/features/shop/queries";

export const dynamic = "force-dynamic";

type CatalogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const data = await getCatalogData(params);

  return <CatalogBrowser data={data} />;
}
