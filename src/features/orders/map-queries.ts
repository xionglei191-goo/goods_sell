import { prisma } from "@/lib/prisma";

export type DealerMapData = {
  dealers: Array<{
    id: string;
    name: string;
    phone: string;
    zone: string;
    latitude: number;
    longitude: number;
    serviceRadius: number;
    isAccepting: boolean;
  }>;
  heatPoints: Array<{
    id: string;
    orderNo: string;
    latitude: number;
    longitude: number;
    amount: number;
  }>;
};

export async function getDealerMapData(): Promise<DealerMapData> {
  const [dealers, orders] = await Promise.all([
    prisma.dealer.findMany({
      include: { customer: { select: { name: true, phone: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: {
        parentId: null,
        address: {
          latitude: { not: null },
          longitude: { not: null },
        },
      },
      include: { address: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return {
    dealers: dealers.map((dealer) => ({
      id: dealer.id,
      name: dealer.shopName || dealer.customer.name,
      phone: dealer.customer.phone,
      zone: dealer.zone,
      latitude: Number(dealer.latitude),
      longitude: Number(dealer.longitude),
      serviceRadius: dealer.serviceRadius,
      isAccepting: dealer.isAccepting,
    })),
    heatPoints: orders
      .filter((order) => order.address.latitude && order.address.longitude)
      .map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        latitude: Number(order.address.latitude),
        longitude: Number(order.address.longitude),
        amount: Number(order.payableAmount),
      })),
  };
}
