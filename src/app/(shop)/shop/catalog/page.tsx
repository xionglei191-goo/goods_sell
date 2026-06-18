import type { Metadata } from "next";

import { CatalogBrowser } from "@/features/shop/CatalogBrowser";
import { getCatalogData } from "@/features/shop/queries";

export const metadata: Metadata = {
  title: "商品分类 | 华启商城",
  description: "浏览华启商城全部商品，涵盖酒类、食品、饮料等品类，湘潭本地配送。",
};

export const dynamic = "force-dynamic";

type CatalogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const data = await getCatalogData(params);

  return <CatalogBrowser data={data} />;
}
