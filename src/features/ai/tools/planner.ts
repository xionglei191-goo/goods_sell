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

function isPurchaseHistoryIntent(message: string) {
  return /买了什么|买过什么|购买记录|消费记录|采购记录|历史购买|最近买|都买了什么|买的哪些|买过哪些|购买过哪些/.test(message);
}

function isPurchaseIntent(message: string) {
  if (isPurchaseHistoryIntent(message)) return false;
  if (/下单|开单|补货/.test(message)) return true;
  if (/(?:我要|我想|我准备|帮客户|给客户|客户要|客人要|帮.*客户).*(?:买|购买|要|来|订)/.test(message)) return true;
  return /(?:买|购买|要|来|订)\s*(?:\d+|[一二两三四五六七八九十]{1,3})\s*(?:箱|件|瓶|提|包|袋|个)/.test(message);
}

function parseOrderNo(message: string) {
  return message.match(/HQ[A-Z0-9-]{6,}/i)?.[0] ?? message.match(/订单\s*([A-Za-z0-9-]{6,})/)?.[1] ?? "";
}

function parseSku(message: string) {
  return message.match(/[A-Z]{2,}-[A-Z0-9-]{2,}/i)?.[0] ?? "";
}

function parsePayMethod(message: string) {
  if (/现金/.test(message)) return "CASH";
  if (/转账|银行/.test(message)) return "TRANSFER";
  if (/挂账|赊账|月结|信用/.test(message)) return "CREDIT";
  return "WECHAT";
}

function parseStockQuantity(message: string) {
  const explicit = message.match(/(?:库存|上报为|报为|设为|设置为|为|有|剩)\s*(\d+)/)?.[1];
  if (explicit) return Number(explicit);
  const matches = Array.from(message.matchAll(/(\d+)\s*(?:件|箱|瓶|个)?/g)).map((match) => Number(match[1]));
  return matches.at(-1) ?? parseQuantity(message).quantity;
}

function stripPaymentWords(value: string) {
  return value
    .replace(/(?:支付方式|付款方式|收款方式)\s*(?:是|为|:|：)?\s*(?:微信支付|微信|现金支付|现金|转账支付|银行转账|转账|挂账|赊账|月结|信用支付)/gi, "")
    .replace(/(?:用|走|选择)?\s*(?:微信支付|微信|现金支付|现金|转账支付|银行转账|转账|挂账|赊账|月结|信用支付)\s*$/gi, "")
    .trim();
}

function cleanProductQuery(message: string) {
  const quantity = parseQuantity(message);
  return stripPaymentWords(message)
    .replace(/帮我|我要|我想|请|麻烦|查一下|查询|查|看看|搜索|找|下单|购买|买|来|订|要|上报|门店/g, "")
    .replace(/^(给|把|将|帮我|请|麻烦)\s*/g, "")
    .replace(quantity.raw, "")
    .replace(/一箱|两箱|一件|两件/g, "")
    .replace(/[，。,.！!？?]/g, "")
    .replace(/(?:用|走|选择)?\s*(?:微信支付|微信|现金支付|现金|转账支付|银行转账|转账|挂账|赊账|月结|信用支付)\s*$/gi, "")
    .replace(/(入库|出库|上报库存|报库存|库存|涨价|降价|调价|改价|价格|零售价|售价)\s*$/g, "")
    .trim();
}

function productQueryFromMessage(message: string) {
  const sku = parseSku(message);
  if (sku) return sku;
  return cleanProductQuery(message)
    .replace(/备注.*$/g, "")
    .replace(/SKU/gi, "")
    .replace(/的?(安全库存|预警阈值|零售价|售价|价格).*$/g, "")
    .trim();
}

function parseDealerStockReport(message: string) {
  const sku = parseSku(message);
  const productQuery = cleanProductQuery(message)
    .replace(/(?:库存|上报为|报为|设为|设置为|为|有|剩)\s*\d+\s*(?:件|箱|瓶|个)?/g, "")
    .replace(/(?:库存(?:上报)?为?|上报为|报为|设为|设置为|为|有|剩)\s*$/g, "")
    .trim();
  return {
    productQuery: sku || productQuery,
    stock: parseStockQuantity(message),
  };
}

function parseSalespersonName(message: string) {
  if (/谁|哪个人|哪位|哪个|哪一个|几个人|几个销售员|多少销售员|销售员.*(几个|多少)|业务员.*(几个|多少)|排名|排行|最好|最高|第一/.test(message)) {
    return "";
  }
  const explicit = message.match(/(?:这个月|本月|今天|最近|查一下|看看|销售员|业务员)?\s*([\u4e00-\u9fa5]{2,4}?)\s*(?:最近|这个月|本月|今天)?的?(?:业绩|绩效|转化|成交|销售结果)/);
  if (explicit?.[1]) return explicit[1];
  const after = message.match(/(?:业绩|绩效|转化|成交).*?([\u4e00-\u9fa5]{2,6})/);
  return after?.[1] ?? "";
}

function isSalespersonStatsIntent(message: string) {
  return (
    /业绩|绩效|转化|成交|销售结果/.test(message)
    || (/(销售员|业务员|销售人员|个人|谁|哪位|哪个人)/.test(message) && /几个|多少|数量|排名|排行|最好|最高|第一|业绩|销售额|订单|客户|回款/.test(message))
  );
}

function parseProductPriceChange(message: string) {
  const productQuery = parseSku(message) || message
    .split(/涨价|降价|调价|改价|价格|售价|零售价/)[0]
    .replace(/把|将|商品|产品|帮我|请|SKU/gi, "")
    .trim();
  const newPrice = message.match(/(?:调到|改成|设为|设置为|到)\s*(\d+(?:\.\d+)?)/)?.[1];
  const up = message.match(/(?:涨|上涨|加)\s*(\d+(?:\.\d+)?)/)?.[1];
  const down = message.match(/(?:降|降低|减)\s*(\d+(?:\.\d+)?)/)?.[1];
  const absolutePrice = message.match(/(?:改成|调到|调整到|设为|设置为)\s*(\d+(?:\.\d+)?)/)?.[1];
  const relativeUp = message.match(/(?:涨价|上调|加价|增加)\s*(\d+(?:\.\d+)?)/)?.[1];
  const relativeDown = message.match(/(?:降价|下调|减价|减少|降低)\s*(\d+(?:\.\d+)?)/)?.[1];
  return {
    productQuery,
    newRetailPrice: newPrice ? Number(newPrice) : absolutePrice ? Number(absolutePrice) : undefined,
    adjustRetailPrice: up ? Number(up) : relativeUp ? Number(relativeUp) : down ? -Number(down) : relativeDown ? -Number(relativeDown) : undefined,
  };
}

function parsePhone(message: string) {
  return message.match(/1[3-9]\d{9}/)?.[0] ?? "";
}

function parseCustomerPurchaseQuery(message: string) {
  const phone = parsePhone(message);
  if (phone) return phone;
  return message
    .replace(/查一下|查询|查|看看|帮我|请|麻烦/g, "")
    .replace(/客户|顾客|用户|会员|这个人|这个客户/g, "")
    .replace(/最近|历史|订单|商品|东西/g, "")
    .replace(/买了什么|买过什么|购买记录|消费记录|采购记录|历史购买|都买了什么|买的哪些|买过哪些|购买过哪些|买/g, "")
    .replace(/[，。,.！!？?]/g, "")
    .trim();
}

function parseStaffRole(message: string): "ADMIN" | "SALESPERSON" | "WAREHOUSE" | "FINANCE" {
  if (/管理员|ADMIN/i.test(message)) return "ADMIN";
  if (/销售|SALESPERSON/i.test(message)) return "SALESPERSON";
  if (/财务|FINANCE/i.test(message)) return "FINANCE";
  return "WAREHOUSE";
}

function parseStaffName(message: string) {
  const explicit = message.match(/(?:创建|新增).*?(?:员工账号|员工|账号)\s*([^\s，。,.！!？?]+)\s*(?:手机号|电话|角色|密码|$)/);
  return explicit?.[1]?.trim() || "";
}

function parseStaffUserQuery(message: string) {
  const phone = parsePhone(message);
  if (phone) return phone;
  return message
    .replace(/启用|恢复|禁用|停用|重置|员工|账号|后台|登录|密码|为|帮我|请/g, "")
    .replace(/[，。,.！!？?:：]/g, " ")
    .trim();
}

function parseStaffPassword(message: string) {
  return message.match(/密码(?:为|改为|重置为)?\s*([A-Za-z0-9_@#$%^&*!-]{6,})/)?.[1] ?? "AiFull123";
}

function parseProductPush(message: string) {
  const productQuery = productQueryFromMessage(message);
  const targetTag =
    message.match(/推送给\s*([^，。,.！!？?\s]+)\s*(?:人群|客户|用户|标签)?/)?.[1]
    ?? message.match(/给\s*([^，。,.！!？?\s]+)\s*(?:人群|客户|用户|标签).*推送/)?.[1]
    ?? "";
  const pushMessage =
    message.match(/(?:话术|文案|内容)\s*[:：]?\s*([^，。,.！!？?]+)/)?.[1]?.trim()
    ?? message.match(/(?:告诉|提醒)客户\s*([^，。,.！!？?]+)/)?.[1]?.trim()
    ?? undefined;
  return {
    productQuery,
    targetTag,
    ...(pushMessage ? { message: pushMessage } : {}),
  };
}

function isProductOperationsIntent(message: string) {
  return /库存|销量|滞销|缺货|商品|毛利/.test(message);
}

function isGlobalInventoryQuestion(message: string) {
  return /库存/.test(message) && /多少|几|哪个|哪款|最多|最少|排行|排名|总数|所有|全部|现在|目前/.test(message);
}

function productOperationsArgs(message: string) {
  const sort =
    /库存.*(最多|最高|排行|排名)|(?:哪个|哪款|谁).*库存.*(?:最多|最高)/.test(message)
      ? "stock_desc"
      : /库存.*(最少|最低|缺货|预警|低库存|快没货|快缺货)|(?:哪个|哪款|谁).*库存.*(?:最少|最低)|低库存|快没货|快缺货/.test(message)
        ? "stock_asc"
        : undefined;
  return {
    query: isGlobalInventoryQuestion(message) ? "" : message,
    limit: 8,
    ...(sort ? { sort } : {}),
  };
}

function parsePaymentRegistration(message: string) {
  const phone = parsePhone(message);
  const orderNo = message.match(/HQ[A-Z0-9-]{6,}/i)?.[0] ?? "";
  const amount = Number(message.match(/(?:收款|回款|登记|到账|收到)\s*(\d+(?:\.\d+)?)/)?.[1] ?? message.match(/(\d+(?:\.\d+)?)\s*(?:元|块)/)?.[1] ?? 0);
  const method = /微信/.test(message) ? "WECHAT" : /现金/.test(message) ? "CASH" : "TRANSFER";
  return { ...(phone ? { customerQuery: phone } : {}), orderNo, amount, method };
}

function parseInvoiceIssue(message: string) {
  const orderNo = parseOrderNo(message);
  const buyerName =
    message.match(/(?:购方|抬头|公司)\s*(?:为|是|:|：)?\s*([^，。,.！!？?\s]+(?:公司|店|部|厂|社)?)/)?.[1]?.trim()
    ?? "";
  const buyerTaxNo = message.match(/(?:税号|纳税人识别号)\s*(?:为|是|:|：)?\s*([A-Za-z0-9-]{6,})/)?.[1]?.trim();
  return {
    orderNo,
    type: /专票|增值税专用/.test(message) ? "SPECIAL" : "NORMAL",
    buyerName,
    ...(buyerTaxNo ? { buyerTaxNo } : {}),
  };
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

function isCustomerAnalyticsIntent(message: string) {
  return /(?:一共|总共|共有|总计|现在|目前).{0,6}(?:多少|几个).{0,4}客户|客户.{0,4}(?:总数|数量|总量|统计|分布|排行)|(?:哪个|哪位|谁).{0,6}(?:消费|购买金额|成交金额).{0,4}(?:最高|最多)|(?:消费|购买金额|成交金额).{0,4}(?:最高|最多).{0,6}客户/.test(message);
}

function customerAnalyticsArgs(message: string) {
  const period = /今天|今日/.test(message) ? "day" : /本周|这周|近7天|近 7 天/.test(message) ? "week" : /本月|这个月|当月/.test(message) ? "month" : "all";
  return { period, limit: /排行|排名|前/.test(message) ? 8 : 5 };
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
  if (isPurchaseHistoryIntent(message) && hasTool(tools, "customer_orders")) {
    return { toolName: "customer_orders", args: { limit: 8 }, reason: "客户查询自己的购买记录" };
  }
  if (/欠款|应收|账款|还要付|待付款/.test(message) && hasTool(tools, "customer_receivables")) {
    return { toolName: "customer_receivables", args: {}, reason: "客户查询自己的账款" };
  }
  if (/订单|配送|物流|发货|送达/.test(message) && hasTool(tools, "customer_orders")) {
    return { toolName: "customer_orders", args: { limit: 5 }, reason: "客户查询自己的订单" };
  }
  if (isPurchaseIntent(message) && hasTool(tools, "customer_submit_order")) {
    const quantity = parseQuantity(message);
    return {
      toolName: "customer_submit_order",
      args: { productQuery: productQueryFromMessage(message), quantity: quantity.quantity, payMethod: parsePayMethod(message) },
      reason: "客户自然语言下单",
    };
  }
  if (hasTool(tools, "search_products")) {
    return { toolName: "search_products", args: { query: cleanProductQuery(message) || message, limit: 5 }, reason: "商品咨询" };
  }
  return null;
}

function planDealer(message: string, tools: readonly AiToolDefinition[]): AiToolPlan | null {
  if (isPurchaseIntent(message) && hasTool(tools, "search_products")) {
    return { toolName: "search_products", args: { query: productQueryFromMessage(message) || message, limit: 5 }, reason: "经销商下单意图商品查询" };
  }
  if (/结算|佣金|账款/.test(message) && hasTool(tools, "dealer_settlement_summary")) {
    return { toolName: "dealer_settlement_summary", args: {}, reason: "经销商查询结算" };
  }
  if (/拒单|拒绝/.test(message)) {
    const orderNo = parseOrderNo(message);
    return {
      toolName: "dealer_reject_routing",
      args: { routingId: orderNo, reason: message.replace(orderNo, "").replace(/拒单|拒绝|订单|原因\s*[:：]?/g, "").trim() || "AI 助手拒单" },
      reason: "经销商拒绝待接订单",
    };
  }
  if (/接单|接受/.test(message) && !/待接|新订单/.test(message)) {
    return { toolName: "dealer_accept_routing", args: { routingId: parseOrderNo(message) }, reason: "经销商接受待接订单" };
  }
  if (/上报.*库存|库存.*上报|报库存|库存有|门店库存/.test(message) && hasTool(tools, "dealer_report_stock")) {
    return {
      toolName: "dealer_report_stock",
      args: parseDealerStockReport(message),
      reason: "经销商上报库存",
    };
  }
  if (/待接|新订单/.test(message) && hasTool(tools, "dealer_incoming_orders")) {
    return { toolName: "dealer_incoming_orders", args: {}, reason: "经销商查询待接订单" };
  }
  return { toolName: "search_products", args: { query: message, limit: 5 }, reason: "经销商商品查询" };
}

function toolPlan(tools: readonly AiToolDefinition[], toolName: string, args: Record<string, unknown>, reason: string): AiToolPlan | null {
  return hasTool(tools, toolName) ? { toolName, args, reason } : null;
}

function planStaff(message: string, tools: readonly AiToolDefinition[]): AiToolPlan | null {
  if (/上线|发布|部署|就绪|还差|待决|配置检查|上线检查/.test(message)) {
    return { toolName: "system_launch_readiness", args: {}, reason: "上线就绪检查" };
  }
  if (isPurchaseHistoryIntent(message)) {
    return toolPlan(tools, "customer_purchase_history", { customerQuery: parseCustomerPurchaseQuery(message), limit: 8 }, "客户购买历史查询");
  }
  if (isPurchaseIntent(message)) {
    return toolPlan(tools, "orders_manual_order_draft", { text: message }, "后台开单草稿")
      ?? toolPlan(tools, "search_products", { query: cleanProductQuery(message) || message, limit: 5 }, "下单意图商品查询");
  }
  if (/创建.*(?:员工|账号)|新增.*(?:员工|账号)/.test(message)) {
    return {
      toolName: "settings_create_staff_user",
      args: { name: parseStaffName(message), phone: parsePhone(message), role: parseStaffRole(message), password: parseStaffPassword(message) },
      reason: "创建员工账号",
    };
  }
  if (/重置.*密码|密码.*重置|改.*密码/.test(message) && /员工|账号|1[3-9]\d{9}/.test(message)) {
    return {
      toolName: "settings_reset_staff_password",
      args: { userQuery: parseStaffUserQuery(message), password: parseStaffPassword(message) },
      reason: "重置员工密码",
    };
  }
  if (/(禁用|停用|启用|恢复).*?(员工|账号)|(员工|账号).*?(禁用|停用|启用|恢复)/.test(message)) {
    return {
      toolName: "settings_set_staff_status",
      args: { userQuery: parseStaffUserQuery(message), isActive: /启用|恢复/.test(message) },
      reason: "启用或禁用员工",
    };
  }
  if (/登记|收款|回款|到账|收到/.test(message) && /HQ[A-Z0-9-]{6,}/i.test(message)) {
    const payment = parsePaymentRegistration(message);
    if (payment.orderNo && payment.amount > 0) {
      return toolPlan(tools, "finance_register_payment", payment, "财务登记收款");
    }
  }
  if (/开.*票|发票/.test(message) && /HQ[A-Z0-9-]{6,}/i.test(message)) {
    return toolPlan(tools, "receipts_issue_invoice", parseInvoiceIssue(message), "财务开票");
  }
  if (isSalespersonStatsIntent(message)) {
    return toolPlan(tools, "salesperson_performance", { salespersonName: parseSalespersonName(message), period: /今天|今日/.test(message) ? "day" : "month" }, "查询销售员业绩");
  }
  if (/涨价|降价|调价|改价|价格.*(改|调|设)|售价.*(改|调|设)/.test(message)) {
    return toolPlan(tools, "admin_update_product_price", parseProductPriceChange(message), "商品调价");
  }
  if (/上架|下架|售罄|缺货/.test(message)) {
    const status = /上架/.test(message) ? "ACTIVE" : /缺货|售罄/.test(message) ? "OUT_OF_STOCK" : "INACTIVE";
    return toolPlan(tools, "admin_update_product_status", { productQuery: productQueryFromMessage(message), status }, "调整商品状态");
  }
  if (/安全库存|预警阈值/.test(message)) {
    return toolPlan(tools, "warehouse_update_safe_stock", { productQuery: productQueryFromMessage(message), safeStock: parseStockQuantity(message) }, "调整安全库存");
  }
  if (/入库|出库/.test(message)) {
    return toolPlan(
      tools,
      /入库/.test(message) ? "inventory_stock_in" : "inventory_stock_out",
      { productQuery: productQueryFromMessage(message), quantity: parseStockQuantity(message), remark: message.match(/备注\s*([^，。,.！!？?]+)/)?.[1]?.trim() || "AI 助手操作" },
      "库存出入库",
    );
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
  if (/新品.*推送|推送.*新品|产品推送|商品推送/.test(message)) {
    return toolPlan(tools, "marketing_create_product_push", parseProductPush(message), "创建新品推送")
      ?? toolPlan(tools, "marketing_product_push_draft", { text: message }, "新品推送草稿");
  }
  if (/应收|回款|欠款|财务|收款/.test(message)) {
    return toolPlan(tools, "finance_summary", { period: /今天|今日/.test(message) ? "day" : "month" }, "财务查询");
  }
  if (/配送|发货|送达|物流/.test(message)) {
    return toolPlan(tools, "delivery_summary", {}, "配送查询");
  }
  if (isCustomerAnalyticsIntent(message)) {
    return toolPlan(tools, "customer_analytics_summary", customerAnalyticsArgs(message), "客户统计分析");
  }
  if (/客户|欠款客户|归属/.test(message)) {
    return toolPlan(tools, "search_customers", { query: message, limit: 8 }, "客户查询");
  }
  if (isProductOperationsIntent(message)) {
    return toolPlan(tools, "product_operations_summary", productOperationsArgs(message), "商品经营查询");
  }
  if (/经销商|线索|询价|报价|渠道|冲突|新品推送/.test(message)) {
    return toolPlan(tools, "channel_summary", {}, "渠道查询");
  }
  if (/经营|总览|概览|看板|数据|销售额|订单数|客户数|毛利|待处理|这个月|本月|今天|今日|最近.*怎么样/.test(message)) {
    return toolPlan(tools, "business_overview", { period: /今天|今日/.test(message) ? "day" : "month" }, "经营总览");
  }
  return null;
}

type CoreIntent =
  | "purchase"
  | "purchase_history"
  | "readiness"
  | "payment"
  | "price"
  | "dealer_reject"
  | "dealer_accept"
  | "dealer_stock"
  | "inventory_flow"
  | "safe_stock"
  | "order_status"
  | "staff_create"
  | "staff_status"
  | "staff_password"
  | "finance_summary"
  | "salesperson_performance"
  | "customer_analytics"
  | "product_operations"
  | "product_push"
  | "invoice";

function detectCoreIntent(message: string): CoreIntent | null {
  if (isPurchaseHistoryIntent(message)) return "purchase_history";
  if (isPurchaseIntent(message)) return "purchase";
  if (/上线|发布|部署|就绪|还差|待决|配置检查|上线检查/.test(message)) return "readiness";
  if (/创建.*(?:员工|账号)|新增.*(?:员工|账号)/.test(message)) return "staff_create";
  if (/(禁用|停用|启用|恢复).*?(员工|账号)|(员工|账号).*?(禁用|停用|启用|恢复)/.test(message)) return "staff_status";
  if (/重置.*密码|密码.*重置|改.*密码/.test(message) && /员工|账号|1[3-9]\d{9}/.test(message)) return "staff_password";
  if (/登记|收款|回款|到账|收到/.test(message) && /HQ[A-Z0-9-]{6,}/i.test(message)) return "payment";
  if (/开.*票|发票/.test(message) && /HQ[A-Z0-9-]{6,}/i.test(message)) return "invoice";
  if (isSalespersonStatsIntent(message)) return "salesperson_performance";
  if (/涨价|降价|调价|改价|价格.*(改|调|设)|售价.*(改|调|设)/.test(message)) return "price";
  if (/应收|回款|欠款|财务|收款|账龄|对账/.test(message)) return "finance_summary";
  if (isCustomerAnalyticsIntent(message)) return "customer_analytics";
  if (/拒单|拒绝/.test(message)) return "dealer_reject";
  if (/接单|接受/.test(message) && !/待接|新订单/.test(message)) return "dealer_accept";
  if (/上报.*库存|库存.*上报|报库存|门店库存.*(?:上报|报为|设为|设置为|\d+)/.test(message)) return "dealer_stock";
  if (isProductOperationsIntent(message)) return "product_operations";
  if (/入库|出库/.test(message)) return "inventory_flow";
  if (/安全库存|预警阈值/.test(message)) return "safe_stock";
  if (/订单.*(确认|发货|送达|完成|取消|作废)|HQ\d+.*(确认|发货|送达|完成|取消|作废)/.test(message)) return "order_status";
  if (/新品.*推送|推送.*新品|产品推送|商品推送/.test(message)) return "product_push";
  return null;
}

function allowedToolsForIntent(intent: CoreIntent) {
  switch (intent) {
    case "purchase":
      return new Set(["customer_submit_order", "orders_manual_order_draft", "search_products"]);
    case "purchase_history":
      return new Set(["customer_purchase_history", "customer_orders"]);
    case "readiness":
      return new Set(["system_launch_readiness"]);
    case "payment":
      return new Set(["finance_register_payment"]);
    case "invoice":
      return new Set(["receipts_issue_invoice"]);
    case "price":
      return new Set(["admin_update_product_price"]);
    case "dealer_reject":
      return new Set(["dealer_reject_routing"]);
    case "dealer_accept":
      return new Set(["dealer_accept_routing"]);
    case "dealer_stock":
      return new Set(["dealer_report_stock"]);
    case "inventory_flow":
      return new Set(["inventory_stock_in", "inventory_stock_out"]);
    case "safe_stock":
      return new Set(["warehouse_update_safe_stock"]);
    case "order_status":
      return new Set(["order_status_action"]);
    case "staff_create":
      return new Set(["settings_create_staff_user"]);
    case "staff_status":
      return new Set(["settings_set_staff_status"]);
    case "staff_password":
      return new Set(["settings_reset_staff_password"]);
    case "finance_summary":
      return new Set(["finance_summary", "finance_statement_summary"]);
    case "salesperson_performance":
      return new Set(["salesperson_performance"]);
    case "customer_analytics":
      return new Set(["customer_analytics_summary"]);
    case "product_operations":
      return new Set(["product_operations_summary"]);
    case "product_push":
      return new Set(["marketing_create_product_push", "marketing_product_push_draft"]);
  }
}

export function validateAiToolPlan(message: string, context: AiToolContext, tools: readonly AiToolDefinition[], plan: AiToolPlan | null): AiToolPlan | null {
  if (!plan) return null;
  const intent = detectCoreIntent(message);
  if ((plan.toolName === "navigate_to_feature" || plan.toolName === "feature_help") && !intent) return plan;
  if (!intent) return plan;

  const allowedTools = allowedToolsForIntent(intent);
  if (allowedTools.has(plan.toolName)) {
    if (intent === "product_operations" && plan.toolName === "product_operations_summary") {
      return planAiToolCall(message, context, tools) ?? plan;
    }
    return plan;
  }

  const fallback = planAiToolCall(message, context, tools);
  if (fallback && allowedTools.has(fallback.toolName)) {
    return {
      ...fallback,
      reason: `${fallback.reason}；已拦截不匹配计划 ${plan.toolName}`,
    };
  }

  return null;
}

export function planAiToolCall(message: string, context: AiToolContext, tools: readonly AiToolDefinition[]): AiToolPlan | null {
  if (context.role === "CONSUMER") return planConsumer(message, tools);
  if (context.role === "DEALER") return planDealer(message, tools);
  return planStaff(message, tools);
}
