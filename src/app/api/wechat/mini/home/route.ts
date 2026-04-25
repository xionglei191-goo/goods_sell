import { NextResponse } from "next/server";

import { getShopHomeData } from "@/features/shop/queries";

export const runtime = "nodejs";

export async function GET() {
  const data = await getShopHomeData();
  return NextResponse.json({ success: true, data });
}
