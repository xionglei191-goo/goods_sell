import { prisma } from "@/lib/prisma";

export type KnowledgeHit = {
  title: string;
  content: string;
  score: number;
};

const faqEntries = [
  {
    title: "配送范围",
    content: "华启商城目前主要服务湖南省湘潭市，覆盖雨湖区、岳塘区、湘潭县、湘乡市、韶山市。下单地址需选择湘潭市。",
    keywords: ["配送", "范围", "湘潭", "多久", "送达", "地址"],
  },
  {
    title: "支付方式",
    content: "商城支持模拟微信支付、现金、转账、赊账。线上第一版使用模拟支付完成订单。",
    keywords: ["支付", "微信", "现金", "转账", "赊账", "付款"],
  },
  {
    title: "退换货政策",
    content: "如商品破损、错发或质量异常，请保留凭证并联系人工客服处理。酒水食品拆封后一般不支持无理由退换。",
    keywords: ["退货", "换货", "破损", "质量", "售后"],
  },
  {
    title: "下单流程",
    content: "用户可在商城选择商品加入购物车，确认湘潭市收货地址后提交订单并完成模拟支付。",
    keywords: ["下单", "购物车", "结算", "订单", "地址"],
  },
];

function tokenize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreText(query: string, content: string, keywords: string[] = []) {
  const tokens = tokenize(query);
  let score = 0;
  for (const token of tokens) {
    if (content.toLowerCase().includes(token)) score += token.length > 1 ? 3 : 1;
    for (const keyword of keywords) {
      if (keyword.includes(token) || token.includes(keyword)) score += 4;
    }
  }
  return score;
}

export async function retrieveKnowledge(query: string, limit = 6): Promise<KnowledgeHit[]> {
  const [products, brands] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      take: 120,
      orderBy: { salesCount: "desc" },
    }),
    prisma.brand.findMany({ select: { name: true, description: true } }),
  ]);

  const productHits = products.map((product) => {
    const content = `${product.name}，品牌：${product.brand.name}，分类：${product.category.name}，规格：${product.spec ?? product.unit}，零售价：${Number(product.retailPrice).toFixed(2)}元，库存：${product.stock}，描述：${product.description ?? "暂无"}`;
    return {
      title: product.name,
      content,
      score: scoreText(query, content, [product.name, product.brand.name, product.category.name, product.sku]),
    };
  });

  const brandHits = brands.map((brand) => {
    const content = `${brand.name}：${brand.description ?? "华启商城合作品牌"}`;
    return { title: brand.name, content, score: scoreText(query, content, [brand.name]) };
  });

  const faqHits = faqEntries.map((entry) => ({
    title: entry.title,
    content: entry.content,
    score: scoreText(query, `${entry.title} ${entry.content}`, entry.keywords),
  }));

  return [...productHits, ...brandHits, ...faqHits]
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildKnowledgePrompt(hits: KnowledgeHit[]) {
  if (hits.length === 0) return "未检索到相关知识。";
  return hits.map((hit, index) => `${index + 1}. ${hit.title}：${hit.content}`).join("\n");
}

export function fallbackAnswer(question: string, hits: KnowledgeHit[]) {
  if (hits.length === 0) {
    return "这个问题我暂时没有可靠资料，建议联系人工客服确认。";
  }

  const productHit = hits.find((hit) => hit.content.includes("零售价"));
  if (productHit && /多少钱|价格|售价|贵|便宜|茅台|五粮液|可乐|啤酒|饮料|白酒/.test(question)) {
    return `我查到：${productHit.content}。价格以实际下单页为准哦。`;
  }

  return `${hits[0].content} 如需更具体的信息，可以继续问我商品名称、配送或支付问题。`;
}
