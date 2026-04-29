import type { LeadScene } from "@prisma/client";

import type { KnowledgeHit } from "@/features/ai/knowledge";

export type ChannelScenario = Extract<LeadScene, "BANQUET" | "GROUP_BUY" | "RESTOCK">;

export type ChannelExtraction = {
  scenario: ChannelScenario;
  budget?: number;
  tables?: number;
  peopleCount?: number;
  quantity?: number;
  company?: string;
  storeType?: string;
  productNeeds: string[];
  brandPreferences: string[];
  purpose?: string;
  deliveryDate?: string;
  invoiceRequired?: boolean;
  packageNeed?: string;
  cycle?: string;
  priceSensitivity?: string;
  raw: string;
};

export type ChannelAiSuggestion = {
  scene: ChannelScenario;
  title: string;
  summary: string;
  details: Array<{ label: string; value: string }>;
  missingFields: string[];
  href: string;
};

const scenarioConfig: Record<ChannelScenario, { title: string; href: string; required: string[] }> = {
  BANQUET: {
    title: "宴席配酒询价",
    href: "/shop/scenes/banquet",
    required: ["桌数", "预算", "配送时间", "联系人"],
  },
  GROUP_BUY: {
    title: "团购送礼询价",
    href: "/shop/scenes/group-buy",
    required: ["数量", "预算", "包装要求", "开票信息", "联系人"],
  },
  RESTOCK: {
    title: "门店补货询价",
    href: "/shop/scenes/restock",
    required: ["门店类型", "补货品类", "补货周期", "联系人"],
  },
};

const commonProducts = ["白酒", "啤酒", "红酒", "饮料", "可乐", "雪碧", "王老吉", "矿泉水", "果汁", "休闲食品"];
const commonBrands = ["茅台", "五粮液", "泸州", "汾酒", "洋河", "青岛", "雪花", "百威", "可口可乐", "农夫山泉", "王老吉"];

function numberAfter(pattern: RegExp, input: string) {
  const match = input.match(pattern);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractBudget(input: string) {
  const tenThousand = input.match(/(\d+(?:\.\d+)?)\s*万/);
  if (tenThousand?.[1]) return Math.round(Number(tenThousand[1]) * 10000);

  const prefix = input.match(/(?:预算|每桌|每份|单价|价位|控制在|大概|左右)[^\d]{0,10}(\d+(?:\.\d+)?)/);
  if (prefix?.[1]) return Number(prefix[1]);

  const suffix = input.match(/(\d+(?:\.\d+)?)\s*(?:元|块).{0,6}(?:预算|每桌|每份|一份|左右|以内)/);
  if (suffix?.[1]) return Number(suffix[1]);

  return undefined;
}

function pickFirst(input: string, candidates: string[]) {
  return candidates.find((item) => input.includes(item));
}

function pickMany(input: string, candidates: string[]) {
  return candidates.filter((item) => input.includes(item));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function detectScenario(input: string): ChannelScenario | null {
  if (/宴席|婚宴|寿宴|升学宴|乔迁宴|满月酒|桌|酒席|喜酒/.test(input)) return "BANQUET";
  if (/团购|福利|节礼|送礼|礼盒|企业|公司|单位|商务|开票|对公|员工/.test(input)) return "GROUP_BUY";
  if (/补货|门店|烟酒店|餐饮店|小超市|便利店|批发|周转|利润|进货/.test(input)) return "RESTOCK";
  return null;
}

function productNamesFromHits(hits: KnowledgeHit[]) {
  return hits.filter((hit) => hit.content.includes("零售价")).map((hit) => hit.title).slice(0, 4);
}

export function extractChannelIntent(input: string, hits: KnowledgeHit[]): ChannelExtraction | null {
  const scenario = detectScenario(input);
  if (!scenario) return null;

  const productNeeds = unique([...pickMany(input, commonProducts), ...productNamesFromHits(hits)]);
  const brandPreferences = unique(pickMany(input, commonBrands));
  const company = input.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,24}(?:公司|单位|企业|门店))/)?.[1];
  const storeType = pickFirst(input, ["烟酒店", "餐饮店", "小超市", "便利店", "批发部", "饭店", "酒店"]);
  const packageNeed = pickFirst(input, ["礼盒", "手提袋", "包装", "整箱", "普通整箱", "定制包装"]);
  const cycle = pickFirst(input, ["每周", "一周", "两周", "半月", "每月", "月度", "随时"]);
  const priceSensitivity = pickFirst(input, ["利润", "周转", "品牌", "便宜", "性价比", "高端", "实惠"]);
  const deliveryDate = input.match(/(今天|明天|后天|周[一二三四五六日天]|端午|中秋|春节|国庆|\d{1,2}月\d{1,2}日)/)?.[1];
  const purpose = pickFirst(input, ["婚宴", "寿宴", "升学宴", "乔迁宴", "员工福利", "客户礼品", "商务拜访", "节礼", "新品试饮"]);

  return {
    scenario,
    budget: extractBudget(input),
    tables: numberAfter(/(\d{1,4})\s*桌/, input),
    peopleCount: numberAfter(/(\d{1,5})\s*(?:人|位)/, input),
    quantity: numberAfter(/(\d{1,5})\s*(?:份|箱|件|提|瓶)/, input),
    company,
    storeType,
    productNeeds,
    brandPreferences,
    purpose,
    deliveryDate,
    invoiceRequired: /开票|发票|对公/.test(input) ? true : undefined,
    packageNeed,
    cycle,
    priceSensitivity,
    raw: input,
  };
}

function extractionLines(extraction: ChannelExtraction) {
  return [
    extraction.purpose ? `用途：${extraction.purpose}` : "",
    extraction.tables ? `桌数：${extraction.tables} 桌` : "",
    extraction.peopleCount ? `人数：${extraction.peopleCount} 人` : "",
    extraction.quantity ? `数量：${extraction.quantity}` : "",
    extraction.budget ? `预算：约 ${extraction.budget} 元` : "",
    extraction.productNeeds.length ? `需求品类：${extraction.productNeeds.join("、")}` : "",
    extraction.brandPreferences.length ? `品牌偏好：${extraction.brandPreferences.join("、")}` : "",
    extraction.company ? `单位：${extraction.company}` : "",
    extraction.storeType ? `门店类型：${extraction.storeType}` : "",
    extraction.packageNeed ? `包装：${extraction.packageNeed}` : "",
    extraction.cycle ? `补货周期：${extraction.cycle}` : "",
    extraction.priceSensitivity ? `价格偏好：${extraction.priceSensitivity}` : "",
    extraction.deliveryDate ? `期望时间：${extraction.deliveryDate}` : "",
    extraction.invoiceRequired ? "需要开票：是" : "",
  ].filter(Boolean);
}

export function buildChannelPromptAddon(extraction: ChannelExtraction) {
  const config = scenarioConfig[extraction.scenario];
  return `\n\n当前识别到用户正在进行「${config.title}」。请按以下要求回答：
1. 先用一小段确认已识别的信息；
2. 给出 2-3 个采购/搭配方向，不夸大功效，不劝酒；
3. 明确还缺哪些报价必要信息；
4. 引导用户点击场景询价入口提交联系方式，由业务员报价。

结构化识别结果：
${extractionLines(extraction).join("\n") || "暂无明确字段，仅识别到场景。"}

合规边界：仅面向成年人，饮酒请适量，AI 建议仅供选品参考，最终价格、库存、配送和开票以人工报价为准。`;
}

export function buildChannelFallbackAnswer(extraction: ChannelExtraction, hits: KnowledgeHit[]) {
  const products = productNamesFromHits(hits);
  const productText = products.length ? `可以优先参考：${products.join("、")}。` : "可以先按白酒、啤酒、饮料三个层次做组合。";
  const lines = extractionLines(extraction);
  const known = lines.length ? `我先识别到：${lines.join("；")}。` : "我先识别到这是一个需要报价的场景。";

  if (extraction.scenario === "BANQUET") {
    return `${known}\n宴席建议先按“主酒 + 啤酒/饮料 + 备用补货”拆预算，避免一次性买偏。${productText}\n还需要确认配送时间、桌数是否含备用桌、是否需要开票和是否有品牌禁忌。提交询价后，业务员会按库存和配送给你报价。`;
  }

  if (extraction.scenario === "GROUP_BUY") {
    return `${known}\n团购送礼建议先确定每份预算、份数、包装和开票抬头，再做 2-3 档组合。${productText}\n还需要确认收货批次、是否分地址配送、包装标准和发票类型。提交询价后会统一报价。`;
  }

  return `${known}\n门店补货建议按“高周转常备 + 利润款 + 新品试饮”来配，既保动销也方便试新品。${productText}\n还需要确认门店类型、补货周期、主销价位和是否有指定品牌。提交补货询价后可由业务员或经销商给组合。`;
}

function addParam(params: URLSearchParams, key: string, value: string | number | boolean | undefined) {
  if (value === undefined || value === "") return;
  params.set(key, String(value));
}

function buildHref(extraction: ChannelExtraction) {
  const config = scenarioConfig[extraction.scenario];
  const params = new URLSearchParams();
  addParam(params, "ai", "1");
  addParam(params, "budget", extraction.budget);
  addParam(params, "notes", `AI识别：${extractionLines(extraction).join("；") || extraction.raw}`);

  if (extraction.scenario === "BANQUET") {
    addParam(params, "tables", extraction.tables);
    addParam(params, "drinkMix", extraction.productNeeds.join("、"));
    addParam(params, "brandPreference", extraction.brandPreferences.join("、"));
    addParam(params, "eventType", extraction.purpose);
  }

  if (extraction.scenario === "GROUP_BUY") {
    addParam(params, "company", extraction.company);
    addParam(params, "recipient", extraction.purpose);
    addParam(params, "quantity", extraction.quantity);
    addParam(params, "packageNeed", extraction.packageNeed);
  }

  if (extraction.scenario === "RESTOCK") {
    addParam(params, "storeType", extraction.storeType);
    addParam(params, "hotCategories", extraction.productNeeds.join("、"));
    addParam(params, "cycle", extraction.cycle);
    addParam(params, "priceSensitivity", extraction.priceSensitivity);
  }

  const query = params.toString();
  return query ? `${config.href}?${query}` : config.href;
}

function buildMissingFields(extraction: ChannelExtraction) {
  const config = scenarioConfig[extraction.scenario];
  const missing = new Set(config.required);
  if (extraction.tables) missing.delete("桌数");
  if (extraction.budget) missing.delete("预算");
  if (extraction.deliveryDate) missing.delete("配送时间");
  if (extraction.quantity) missing.delete("数量");
  if (extraction.packageNeed) missing.delete("包装要求");
  if (extraction.invoiceRequired !== undefined) missing.delete("开票信息");
  if (extraction.storeType) missing.delete("门店类型");
  if (extraction.productNeeds.length) missing.delete("补货品类");
  if (extraction.cycle) missing.delete("补货周期");
  return Array.from(missing);
}

export function buildChannelSuggestion(extraction: ChannelExtraction): ChannelAiSuggestion {
  const config = scenarioConfig[extraction.scenario];
  const details = extractionLines(extraction)
    .slice(0, 6)
    .map((line) => {
      const [label, ...rest] = line.split("：");
      return { label, value: rest.join("：") || line };
    });

  return {
    scene: extraction.scenario,
    title: config.title,
    summary: details.length ? "已把你的描述整理成询价草稿。" : "已识别到适合走询价报价流程。",
    details,
    missingFields: buildMissingFields(extraction),
    href: buildHref(extraction),
  };
}
