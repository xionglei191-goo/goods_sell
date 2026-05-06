export type AssistantIntentMode = "DATA_QUERY" | "NAVIGATE" | "DRAFT" | "WRITE" | "HIGH_RISK" | "CLARIFY";

export type AssistantIntentPolicy = {
  mode: AssistantIntentMode;
  isNavigationLike: boolean;
  isBusinessDataQuery: boolean;
  isStrongBusinessDataQuery: boolean;
  reasons: string[];
};

type ToolNameLike = string | { toolName?: string | null };

const navigationPattern =
  /在哪|哪里|入口|菜单|页面|打开|进入|跳转|怎么进入|如何进入|怎么打开|如何打开|页面能做什么|功能在哪|在哪配置|怎么配置|如何配置|在哪管理|怎么查看|如何查看/;
const shortFeatureLookupPattern = /^(?:查|看|查看)?(?:购物车|供应商管理|库存流水|微信菜单|经销商政策|物流配送|配送管理)$/;
const strongQuestionPattern = /多少|几个|哪些|哪[个款位些]|谁|最多|最高|最少|最低|排行|排名|列表|明细|统计|总数|总量|数量|第一|最好/;
const strongDomainDataPattern =
  /欠款|应收|回款|账龄|业绩|绩效|销售额|订单数|客户数|库存排行|库存最多|库存最少|低库存|缺货|消费最高|消费最多|配送订单|客户.*配送|配送.*客户|待发货|配送中|已送达|发票.*(?:多少|哪些|列表)|票据.*(?:多少|哪些|列表)|日志.*(?:哪些|谁|列表)/;
const businessDomainPattern =
  /经营|销售|订单|客户|库存|商品|欠款|应收|财务|回款|采购|供应商|配送|物流|销售员|业务员|发票|票据|线索|询价|报价|推广码|渠道|经销商|优惠券|购物车|微信|日志|素材|品牌|分类/;
const summaryAskPattern = /怎么样|情况|概况|数据|表现|趋势|报表|现在|目前|这个月|本月|今天|今日|本周|最近|多少|几个|哪些|列表|明细|排行|最多|最高|最少|最低|统计|总数|总量|谁/;
const writePattern =
  /新增|创建|录入|修改|调整|改成|设置|禁用|启用|重置|上架|下架|入库|出库|发货|确认|送达|完成|取消|登记收款|收款|开票|发券|审核|通过|驳回|上报|接单|拒单|推送/;
const highRiskPattern = /收款|开票|发券|审核|通过|驳回|禁用|重置|系统配置|员工账号|创建员工/;
const draftPattern = /草稿|方案|文案|报价草稿|开单草稿|整理/;

function normalizeMessage(message: string) {
  return message.replace(/\s+/g, "").trim();
}

function includesBusinessDomain(message: string) {
  return businessDomainPattern.test(message);
}

function hasStrongBusinessQuestion(message: string) {
  return strongQuestionPattern.test(message) || strongDomainDataPattern.test(message);
}

export function isNavigationToolName(toolName: string | null | undefined) {
  return toolName === "navigate_to_feature" || toolName === "feature_help";
}

export function classifyAssistantRequest(message: string): AssistantIntentPolicy {
  const normalized = normalizeMessage(message);
  const reasons: string[] = [];

  if (!normalized) {
    return { mode: "CLARIFY", isNavigationLike: false, isBusinessDataQuery: false, isStrongBusinessDataQuery: false, reasons: ["empty"] };
  }

  const isNavigationLike = navigationPattern.test(normalized) || shortFeatureLookupPattern.test(normalized);
  const isStrongBusinessDataQuery = hasStrongBusinessQuestion(normalized);
  const isBusinessDataQuery =
    isStrongBusinessDataQuery || (includesBusinessDomain(normalized) && summaryAskPattern.test(normalized) && !shortFeatureLookupPattern.test(normalized));

  if (isNavigationLike) reasons.push("navigation_phrase");
  if (isStrongBusinessDataQuery) reasons.push("strong_business_question");
  if (isBusinessDataQuery) reasons.push("business_data_query");

  if (isBusinessDataQuery) {
    return { mode: "DATA_QUERY", isNavigationLike, isBusinessDataQuery, isStrongBusinessDataQuery, reasons };
  }

  if (isNavigationLike) {
    return { mode: "NAVIGATE", isNavigationLike, isBusinessDataQuery, isStrongBusinessDataQuery, reasons };
  }

  if (highRiskPattern.test(normalized)) {
    reasons.push("high_risk_action");
    return { mode: "HIGH_RISK", isNavigationLike, isBusinessDataQuery, isStrongBusinessDataQuery, reasons };
  }

  if (writePattern.test(normalized)) {
    reasons.push("write_action");
    return { mode: "WRITE", isNavigationLike, isBusinessDataQuery, isStrongBusinessDataQuery, reasons };
  }

  if (draftPattern.test(normalized)) {
    reasons.push("draft_action");
    return { mode: "DRAFT", isNavigationLike, isBusinessDataQuery, isStrongBusinessDataQuery, reasons };
  }

  return { mode: "DATA_QUERY", isNavigationLike, isBusinessDataQuery: includesBusinessDomain(normalized), isStrongBusinessDataQuery, reasons };
}

export function shouldBoostNavigationTools(message: string) {
  return classifyAssistantRequest(message).mode === "NAVIGATE";
}

export function shouldPreferReadTools(message: string) {
  return classifyAssistantRequest(message).mode === "DATA_QUERY";
}

export function shouldRejectNavigationPlan(message: string, planOrSteps: ToolNameLike | readonly ToolNameLike[]) {
  const policy = classifyAssistantRequest(message);
  if (policy.mode !== "DATA_QUERY") return false;
  const items = Array.isArray(planOrSteps) ? planOrSteps : [planOrSteps];
  return items.some((item) => {
    const toolName = typeof item === "string" ? item : item.toolName;
    return isNavigationToolName(toolName);
  });
}

export function describeAssistantIntentPolicyForPrompt() {
  return [
    "意图边界：先判断用户是在查业务数据、找页面入口、生成草稿还是写操作。",
    "业务数据查询：包含多少、几个、哪些、列表、明细、排行、最多、最高、欠款、库存、业绩、客户数、配送订单等，必须选择业务 READ 工具。",
    "页面导航：只有明确问在哪、打开、入口、菜单、怎么进入、页面能做什么时，才使用 navigate_to_feature 或 feature_help。",
    "如果业务查询被规划为导航，服务端会拒绝并要求重新选择 READ 工具。",
  ].join("");
}
