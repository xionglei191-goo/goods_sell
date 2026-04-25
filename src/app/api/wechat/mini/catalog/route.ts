import { NextResponse, type NextRequest } from "next/server";

import { getCatalogData } from "@/features/shop/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const data = await getCatalogData(params);
  return NextResponse.json({ success: true, data });
}
