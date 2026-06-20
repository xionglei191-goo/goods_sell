import { DealerMap } from "@/features/orders/DealerMap";
import { getDealerMapData } from "@/features/orders/map-queries";

export const dynamic = "force-dynamic";

export default async function DashboardMapPage() {
  const data = await getDealerMapData();
  const amapKey = process.env.NEXT_PUBLIC_AMAP_KEY ?? process.env.AMAP_KEY ?? "";
  const amapSecurityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE ?? process.env.NEXT_PUBLIC_AMAP_SECRET ?? process.env.AMAP_SECURITY_CODE ?? process.env.AMAP_SECRET ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">地图管理</h1>
        <p className="mt-1 text-sm text-neutral-500">经销商 Marker、服务半径与订单热力分布</p>
      </div>
      <DealerMap amapKey={amapKey} amapSecurityCode={amapSecurityCode} data={data} />
    </div>
  );
}
