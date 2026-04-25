import { NextResponse } from "next/server";

import { getProductDetailData } from "@/features/shop/queries";

export const runtime = "nodejs";

type ProductRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: ProductRouteProps) {
  const { id } = await params;
  const data = await getProductDetailData(id);
  return NextResponse.json({ success: true, data });
}
