import type { AiToolContext, AiToolDefinition, AiToolPlan } from "@/features/ai/tools/types";

const chineseDigits: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function hasTool(tools: readonly AiToolDefinition[], name: string) {
  return tools.some((tool) => tool.name === name);
}

function numberValue(value?: string) {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "十") return 10;
  if (value.endsWith("十")) return (chineseDigits[value[0]] ?? 1) * 10;
  if (value.includes("十")) {
    const [left, right] = value.split("十");
    return (chineseDigits[left] ?? 1) * 10 + (chineseDigits[right] ?? 0);
  }
  return chineseDigits[value];
}

function parseQuantity(message: string) {
  const match = message.match(/(\d+|[一二两三四五六七八九十]{1,3})\s*(箱|件|瓶|提|包|袋|个)?/);
  const quantity = numberValue(match?.[1]) ?? 1;
  return {
    quantity,
    unit: match?.[2] ?? "件",
    raw: match?.[0] ?? "",
  };
}

function cleanProductQuery(message: string) {
  const quantity = parseQuantity(message);
  return message
    .replace(/帮我|我要|我想|请|麻烦|下单|购买|买|来|订|要/g, "")
    .replace(quantity.raw, "")
    .replace(/一箱|两箱|一件|两件/g, "")
    .replace(/[，。,.！!？?]/g, "")
    .trim();
}

function parseSalespersonName(message: string) {
  const explicit = message.match(/(?:这个月|本月|今天|最近|查一下|看看)?\s*([\u4e00-\u9fa5]{2,6})\s*的?业绩/);
  if (explicit?.[1]) return explicit[1];
  const after = message.match(/业绩.*?([\u4e00-\u9fa5]{2,6})/);
  return after?.[1] ?? "";
}

function parseProductPriceChange(message: string) {
  const productQuery = message
    .split(/涨价|降价|调价|改价|价格|售价|零售价/)[0]
    .replace(/把|将|商品|产品|帮我|请/g, "")
    .trim();
  const newPrice = message.match(/(?:调到|改成|设为|设置为|到)\s*(\d+(?:\.\d+)?)/)?.[1];
  const up = message.match(/(?:涨|上涨|加)\s*(\d+(?:\.\d+)?)/)?.[1];
  const down = message.match(/(?:降|降低|减)\s*(\d+(?:\.\d+)?)/)?.[1];
  return {
    productQuery,
    newRetailPrice: newPrice ? Number(newPrice) : undefined,
    adjustRetailPrice: up ? Number(up) : down ? -Number(down) : undefined,
  };
}

function parsePhone(message: string) {
  return message.match(/1[3-9]\d{9}/)?.[0] ?? "";
}

function parseCustomerName(message: string) {
  const phone = parsePhone(message);
  const cleaned = message
    .replace(phone, "")
    .replace(/新增客户|创建客户|录入客户|客户|姓名|叫|手机号|电话|帮我|请/g, "")
    .replace(/[，。,.！!？?:：]/g, " ")
    .trim();
  return cleaned.match(/[\u4e00-\u9fa5]{2,8}/)?.[0] ?? "";
}

function parseTags(message: string) {
  const match = message.match(/标签(?:为|是|:|：)?\s*([^，。,.！!？?]+)/);
  return match?.[1]
    ?.split(/[、,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
}

function parseOrderAction(message: string) {
  const orderNo = message.match(/(HQ\d{10,})/)?.[1] ?? message.match(/订单\s*([A-Za-z0-9-]{6,})/)?.[1] ?? "";
  if (/取消|作废/.test(message)) return { orderNo, action: "cancel" };
  if (/发货|发出/.test(message)) return { orderNo, action: "ship" };
  if (/送达|已到/.test(message)) return { orderNo, action: "deliver" };
  if (/完成|完结/.test(message)) return { orderNo, action: "complete" };
  return { orderNo, action: "confirm" };
}

function planConsumer(message: string, tools: readonly AiToolDefinition[]): AiToolPlan | null {
  if (/欠款|应收|账款|还要付|待付款/.test(message) && hasTool(tools, "customer_receivables")) {
    return { toolName: "customer_receivables", args: {}, reason: "客户查询自己的账款" };
  }
  if (/订单|配送|物流|发货|送达/.test(message) && hasTool(tools, "customer_orders")) {
    return { toolName: "customer_orders", args: { limit: 5 }, reason: "客户查询自己的订单" };
  }
  if (/下单|购买|买|来\d|来一|来两|要\d|要一|要两/.test(message) && hasTool(tools, "customer_submit_order")) {
    const quantity = parseQuantity(message);
    return {
      toolName: "customer_submit_order",
      args: { productQuery: cleanProductQuery(message), quantity: quantity.quantity, payMethod: "WECHAT" },
      reason: "客户自然语言下单",
    };
  }
  if (hasTool(tools, "search_products")) {
    return { toolName: "search_products", args: { query: message, limit: 5 }, reason: "商品咨询" };
  }
  return null;
}

function planDealer(message: string, tools: readonly AiToolDefinition[]): AiToolPlan | null {
  if (/结算|佣金|账款/.test(message) && hasTool(tools, "dealer_settlement_summary")) {
    return { toolName: "dealer_settlement_summary", args: {}, reason: "经销商查询结算" };
  }
  if (/待接|接单|新订单/.test(message) && hasTool(tools, "dealer_incoming_orders")) {
    return { toolName: "dealer_incoming_orders", args: {}, reason: "经销商查询待接订单" };
  }
  if (/上报库存|报库存|库存有/.test(message) && hasTool(tools, "dealer_report_stock")) {
    const quantity = parseQuantity(message);
    return {
      toolName: "dealer_report_stock",
      args: { productQuery: cleanProductQuery(message), stock: quantity.quantity },
      reason: "经销商上报库存",
    };
  }
  return { toolName: "search_products", args: { query: message, limit: 5 }, reason: "经销商商品查询" };
}

function toolPlan(tools: readonly AiToolDefinition[], toolName: string, args: Record<string, unknown>, reason: string): AiToolPlan | null {
  return hasTool(tools, toolName) ? { toolName, args, reason } : null;
}

function planStaff(message: string, tools: readonly AiToolDefinition[]): AiToolPlan | null {
  if (/业绩|绩效/.test(message)) {
    return toolPlan(tools, "salesperson_performance", { salespersonName: parseSalespersonName(message), period: /今天|今日/.test(message) ? "day" : "month" }, "查询销售员业绩");
  }
  if (/涨价|降价|调价|改价|价格.*(改|调|设)|售价.*(改|调|设)/.test(message)) {
    return toolPlan(tools, "admin_update_product_price", parseProductPriceChange(message), "商品调价");
  }
  if (/上架|下架|售罄|缺货/.test(message)) {
    const status = /上架/.test(message) ? "ACTIVE" : /缺货|售罄/.test(message) ? "OUT_OF_STOCK" : "INACTIVE";
    return toolPlan(tools, "admin_update_product_status", { productQuery: cleanProductQuery(message), status }, "调整商品状态");
  }
  if (/安全库存|预警阈值/.test(message)) {
    const quantity = parseQuantity(message);
    return toolPlan(tools, "warehouse_update_safe_stock", { productQuery: cleanProductQuery(message), safeStock: quantity.quantity }, "调整安全库存");
  }
  if (/入库|出库/.test(message)) {
    const quantity = parseQuantity(message);
    return toolPlan(tools, /入库/.test(message) ? "inventory_stock_in" : "inventory_stock_out", { productQuery: cleanProductQuery(message), quantity: quantity.quantity, remark: "AI 助手操作" }, "库存出入库");
  }
  if (/订单.*(确认|发货|送达|完成|取消|作废)|HQ\d+/.test(message)) {
    return toolPlan(tools, "order_status_action", parseOrderAction(message), "订单状态操作");
  }
  if (/新增客户|创建客户|录入客户/.test(message)) {
    const phone = parsePhone(message);
    const name = parseCustomerName(message);
    return toolPlan(tools, "admin_create_customer", { name, phone, customerType: /经销商/.test(message) ? "DEALER" : "CONSUMER", tags: parseTags(message) }, "新增客户");
  }
  if (/客户.*标签|标签.*客户/.test(message)) {
    const tags = parseTags(message);
    if (tags.length) {
      return toolPlan(tools, "admin_update_customer_tags", { customerQuery: message, tags, mode: /追加|加/.test(message) ? "add" : /移除|删除/.test(message) ? "remove" : "replace" }, "调整客户标签");
    }
  }
  if (/经销商.*(暂停接单|停止接单|启用接单|恢复接单)/.test(message)) {
    return toolPlan(tools, "admin_set_dealer_accepting", { dealerQuery: message.replace(/暂停接单|停止接单|启用接单|恢复接单|经销商/g, "").trim(), isActive: /启用|恢复/.test(message) }, "启停经销商接单");
  }
  if (/经销商.*政策|政策.*经销商/.test(message)) {
    return toolPlan(tools, "admin_update_dealer_policy", { dealerQuery: message.replace(/经销商|政策|修改|调整/g, "").trim() }, "修改经销商政策");
  }
  if (/创建优惠券|新增优惠券/.test(message)) {
    const amount = Number(message.match(/(?:减|优惠|面额)\s*(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    const threshold = Number(message.match(/满\s*(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    const totalQuantity = Number(message.match(/(\d+)\s*张/)?.[1] ?? 100);
    return toolPlan(tools, "marketing_create_coupon", { name: message.replace(/创建优惠券|新增优惠券/g, "").trim() || "AI 优惠券", couponType: "AMOUNT", ...(amount > 0 ? { amount } : {}), threshold, totalQuantity }, "创建优惠券");
  }
  if (/上线|发布|部署|就绪|还差|待决|配置检查|上线检查/.test(message)) {
    return toolPlan(tools, "system_launch_readiness", {}, "上线就绪检查");
  }
  if (/应收|回款|欠款|财务|收款/.test(message)) {
    return toolPlan(tools, "finance_summary", { period: /今天|今日/.test(message) ? "day" : "month" }, "财务查询");
  }
  if (/配送|发货|送达|物流/.test(message)) {
    return toolPlan(tools, "delivery_summary", {}, "配送查询");
  }
  if (/客户|欠款客户|归属/.test(message)) {
    return toolPlan(tools, "search_customers", { query: message, limit: 8 }, "客户查询");
  }
  if (/库存|销量|滞销|缺货|商品/.test(message)) {
    return toolPlan(tools, "product_operations_summary", { query: message, limit: 8 }, "商品经营查询");
  }
  if (/经销商|线索|询价|报价|渠道|冲突|新品推送/.test(message)) {
    return toolPlan(tools, "channel_summary", {}, "渠道查询");
  }
  return toolPlan(tools, "business_overview", { period: /今天|今日/.test(message) ? "day" : "month" }, "经营总览") ?? null;
}

export function planAiToolCall(message: string, context: AiToolContext, tools: readonly AiToolDefinition[]): AiToolPlan | null {
  if (context.role === "CONSUMER") return planConsumer(message, tools);
  if (context.role === "DEALER") return planDealer(message, tools);
  return planStaff(message, tools);
}
