import type { LeadScene, OrderStatus, OrderType, Prisma } from "@prisma/client";

export type CustomerSegment = "HIGH_VALUE_GROUP_BUY" | "RESTAURANT" | "TOBACCO_WINE_STORE" | "BANQUET" | "REGULAR";

export const customerSegmentLabels: Record<CustomerSegment, string> = {
  HIGH_VALUE_GROUP_BUY: "高价值团购",
  RESTAURANT: "餐饮店",
  TOBACCO_WINE_STORE: "烟酒店",
  BANQUET: "宴席客户",
  REGULAR: "普通消费者",
};

export const customerSegmentClasses: Record<CustomerSegment, string> = {
  HIGH_VALUE_GROUP_BUY: "bg-[var(--dashboard-transaction-soft)] text-[#b9472d]",
  RESTAURANT: "bg-emerald-50 text-emerald-700",
  TOBACCO_WINE_STORE: "bg-amber-50 text-amber-700",
  BANQUET: "bg-red-50 text-red-700",
  REGULAR: "bg-[var(--dashboard-transaction-soft)] text-slate-600",
};

type CustomerOrderSignal = {
  type: OrderType;
  status: OrderStatus;
  payableAmount: unknown;
  createdAt: Date;
};

type CustomerLeadSignal = {
  scene: LeadScene;
  metadata: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
};

type CustomerInquirySignal = {
  scene: LeadScene;
  budget: unknown;
  content: Prisma.JsonValue;
  notes: string | null;
  createdAt: Date;
};

type CustomerProfileSignal = {
  tags: Prisma.JsonValue;
} | null;

type CustomerTagSignal = {
  name: string;
};

export type CustomerSegmentationInput = {
  type: "CONSUMER" | "DEALER";
  createdAt: Date;
  tags: CustomerTagSignal[];
  profile: CustomerProfileSignal;
  orders: CustomerOrderSignal[];
  leads: CustomerLeadSignal[];
  inquiries: CustomerInquirySignal[];
};

const revenueStatuses = new Set<OrderStatus>(["PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"]);

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Prisma.JsonValue>) : null;
}

function collectJsonText(value: Prisma.JsonValue | null | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => collectJsonText(item)).join(" ");
  const object = jsonObject(value);
  return object ? Object.values(object).map((item) => collectJsonText(item)).join(" ") : "";
}

function numberValue(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function profileLabels(profile: CustomerProfileSignal) {
  const object = jsonObject(profile?.tags);
  const labels = object?.labels;
  const businessSegments = object?.businessSegments;
  const result = new Set<string>();
  if (Array.isArray(labels)) {
    labels.forEach((item) => {
      if (typeof item === "string") result.add(item);
    });
  }
  if (Array.isArray(businessSegments)) {
    businessSegments.forEach((item) => {
      if (typeof item === "string") result.add(item);
    });
  }
  return result;
}

function latestDate(values: Date[]) {
  return values.reduce<Date | null>((latest, value) => (!latest || value > latest ? value : latest), null);
}

export function evaluateCustomerSegment(customer: CustomerSegmentationInput) {
  const labels = profileLabels(customer.profile);
  for (const tag of customer.tags) labels.add(tag.name);

  const revenueOrders = customer.orders.filter((order) => revenueStatuses.has(order.status));
  const totalSpent = revenueOrders.reduce((sum, order) => sum + numberValue(order.payableAmount), 0);
  const groupBuyOrders = revenueOrders.filter((order) => order.type === "GROUP_BUY");
  const wholesaleOrders = revenueOrders.filter((order) => order.type === "WHOLESALE");
  const groupBuyAmount = groupBuyOrders.reduce((sum, order) => sum + numberValue(order.payableAmount), 0);
  const sceneCounts = new Map<LeadScene, number>();
  const addScene = (scene: LeadScene) => sceneCounts.set(scene, (sceneCounts.get(scene) ?? 0) + 1);

  for (const order of revenueOrders) {
    if (order.type === "GROUP_BUY") addScene("GROUP_BUY");
    if (order.type === "WHOLESALE") addScene("RESTOCK");
  }
  for (const lead of customer.leads) addScene(lead.scene);
  for (const inquiry of customer.inquiries) addScene(inquiry.scene);

  const restockText = [
    ...customer.leads.filter((lead) => lead.scene === "RESTOCK").map((lead) => `${collectJsonText(lead.metadata)} ${lead.notes ?? ""}`),
    ...customer.inquiries.filter((inquiry) => inquiry.scene === "RESTOCK").map((inquiry) => `${collectJsonText(inquiry.content)} ${inquiry.notes ?? ""}`),
    ...Array.from(labels).filter((label) => label.includes("餐饮") || label.includes("烟酒") || label.includes("补货")),
  ].join(" ");
  const hasRestaurantSignal = /餐饮|餐馆|餐厅|饭店|烧烤|夜宵|酒店/.test(restockText) || labels.has("画像:餐饮采购");
  const hasTobaccoWineSignal = /烟酒店|烟酒|酒水|便利店|小超市|超市|门店|零售/.test(restockText) || labels.has("画像:烟酒店补货");
  const banquetCount = sceneCounts.get("BANQUET") ?? 0;
  const groupBuyCount = sceneCounts.get("GROUP_BUY") ?? 0;
  const restockCount = sceneCounts.get("RESTOCK") ?? 0;
  const latestActivityAt = latestDate([
    ...customer.orders.map((order) => order.createdAt),
    ...customer.leads.map((lead) => lead.createdAt),
    ...customer.inquiries.map((inquiry) => inquiry.createdAt),
  ]);

  const reasons: string[] = [];
  if (groupBuyAmount >= 3000 || groupBuyOrders.length >= 2 || labels.has("画像:企业团购")) reasons.push("团购金额或团购次数较高");
  if (hasRestaurantSignal) reasons.push("补货文本或画像指向餐饮采购");
  if (hasTobaccoWineSignal) reasons.push("补货文本或画像指向烟酒店/零售门店");
  if (banquetCount > 0 || labels.has("画像:宴席客户")) reasons.push("出现宴席询价或宴席画像");
  if (reasons.length === 0) reasons.push("暂无明确经营场景，按普通消费者维护");

  let segment: CustomerSegment = "REGULAR";
  if (groupBuyAmount >= 3000 || groupBuyOrders.length >= 2 || (labels.has("画像:企业团购") && totalSpent >= 1000)) {
    segment = "HIGH_VALUE_GROUP_BUY";
  } else if (hasRestaurantSignal && (restockCount > 0 || wholesaleOrders.length > 0 || customer.type === "DEALER")) {
    segment = "RESTAURANT";
  } else if (hasTobaccoWineSignal && (restockCount > 0 || wholesaleOrders.length > 0 || customer.type === "DEALER")) {
    segment = "TOBACCO_WINE_STORE";
  } else if (banquetCount > 0 || labels.has("画像:宴席客户")) {
    segment = "BANQUET";
  }

  const nextAction =
    segment === "HIGH_VALUE_GROUP_BUY"
      ? "安排专人维护团购预算、开票和批量配送"
      : segment === "RESTAURANT"
        ? "推荐高周转餐饮常备品，跟进补货周期"
        : segment === "TOBACCO_WINE_STORE"
          ? "绑定门店码和库存上报，推新品试饮"
          : segment === "BANQUET"
            ? "提前跟进宴席日期、桌数和备用补货"
            : "引导进入场景询价，补充画像标签";

  return {
    segment,
    reasons: reasons.slice(0, 3),
    nextAction,
    metrics: {
      totalSpent,
      groupBuyAmount,
      orderCount: customer.orders.length,
      revenueOrderCount: revenueOrders.length,
      groupBuyCount,
      restockCount,
      banquetCount,
      latestActivityAt,
    },
  };
}
