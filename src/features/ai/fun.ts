import { auth } from "@/auth";
import { callAnthropicCompatible } from "@/features/ai/provider";
import { prisma } from "@/lib/prisma";

type SolarTerm = {
  name: string;
  month: number;
  day: number;
  season: "spring" | "summer" | "autumn" | "winter";
};

const solarTerms: SolarTerm[] = [
  { name: "小寒", month: 1, day: 6, season: "winter" },
  { name: "大寒", month: 1, day: 20, season: "winter" },
  { name: "立春", month: 2, day: 4, season: "spring" },
  { name: "雨水", month: 2, day: 19, season: "spring" },
  { name: "惊蛰", month: 3, day: 6, season: "spring" },
  { name: "春分", month: 3, day: 21, season: "spring" },
  { name: "清明", month: 4, day: 5, season: "spring" },
  { name: "谷雨", month: 4, day: 20, season: "spring" },
  { name: "立夏", month: 5, day: 6, season: "summer" },
  { name: "小满", month: 5, day: 21, season: "summer" },
  { name: "芒种", month: 6, day: 6, season: "summer" },
  { name: "夏至", month: 6, day: 21, season: "summer" },
  { name: "小暑", month: 7, day: 7, season: "summer" },
  { name: "大暑", month: 7, day: 23, season: "summer" },
  { name: "立秋", month: 8, day: 8, season: "autumn" },
  { name: "处暑", month: 8, day: 23, season: "autumn" },
  { name: "白露", month: 9, day: 8, season: "autumn" },
  { name: "秋分", month: 9, day: 23, season: "autumn" },
  { name: "寒露", month: 10, day: 8, season: "autumn" },
  { name: "霜降", month: 10, day: 24, season: "autumn" },
  { name: "立冬", month: 11, day: 8, season: "winter" },
  { name: "小雪", month: 11, day: 22, season: "winter" },
  { name: "大雪", month: 12, day: 7, season: "winter" },
  { name: "冬至", month: 12, day: 22, season: "winter" },
];

const seasonCategory: Record<SolarTerm["season"], string[]> = {
  spring: ["果汁饮料", "茶饮料", "红酒"],
  summer: ["碳酸饮料", "果汁饮料", "啤酒"],
  autumn: ["茶饮料", "休闲食品", "红酒"],
  winter: ["白酒", "方便食品", "调味品"],
};

export const personalityQuestions = [
  { id: "party", question: "朋友聚会你更喜欢？", options: ["热闹畅聊", "安静小酌", "负责张罗"] },
  { id: "taste", question: "你偏爱的口味？", options: ["醇厚", "清爽", "微甜"] },
  { id: "gift", question: "送礼时你更看重？", options: ["体面经典", "新鲜有趣", "实用划算"] },
  { id: "pace", question: "你的生活节奏？", options: ["稳扎稳打", "灵活轻快", "效率优先"] },
  { id: "scene", question: "最常购买场景？", options: ["家宴聚餐", "日常囤货", "门店补货"] },
];

function termForDate(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  let current = solarTerms[0];
  for (const term of solarTerms) {
    if (month > term.month || (month === term.month && day >= term.day)) {
      current = term;
    }
  }
  return current;
}

export async function getSolarTermRecommendation() {
  const term = termForDate();
  const cacheKey = `solar-term:${new Date().getFullYear()}:${term.name}`;
  const cached = await prisma.aiContentCache.findUnique({ where: { key: cacheKey } });
  const categories = seasonCategory[term.season];
  const products = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      category: { name: { in: categories } },
    },
    include: {
      brand: { select: { name: true } },
      category: { select: { name: true } },
      images: { where: { isPrimary: true }, select: { url: true }, take: 1 },
    },
    take: 6,
    orderBy: { salesCount: "desc" },
  });

  if (cached) {
    return { term, content: cached.content as { advice: string }, products };
  }

  let advice = `${term.name}时节，湘潭天气变化明显，饮食宜清淡有节制，聚餐可搭配适量热饮或应季饮品。`;
  try {
    advice = await callAnthropicCompatible({
      system: "你是华启商城养生推荐助手，请用80字以内中文给出节气饮食建议，不要涉及医疗诊断。",
      messages: [{ role: "user", content: `当前节气是${term.name}，请给湘潭本地用户一段温和的饮食和聚餐建议。` }],
      maxTokens: 300,
    });
  } catch {
    // Keep deterministic fallback.
  }

  await prisma.aiContentCache.upsert({
    where: { key: cacheKey },
    update: { content: { advice } },
    create: { key: cacheKey, content: { advice } },
  });

  return { term, content: { advice }, products };
}

export function generatePersonalityResult(answers: Record<string, string>) {
  const text = Object.values(answers).join(" ");
  if (/醇厚|体面|稳扎|家宴/.test(text)) {
    return { title: "酱香型白酒性格", category: "酒类", description: "你沉稳、有分寸，重视关系里的仪式感，适合经典白酒和家宴场景。" };
  }
  if (/清爽|灵活|日常|轻快/.test(text)) {
    return { title: "清爽啤酒性格", category: "饮料", description: "你轻松随和，喜欢把日子过得舒服，适合啤酒、茶饮和清爽饮料。" };
  }
  return { title: "果香微醺性格", category: "食品", description: "你有亲和力，也喜欢新鲜感，适合果汁、红酒和休闲食品组合。" };
}

export async function savePersonalityPreference(answers: Record<string, string>) {
  const session = await auth();
  if (!session?.user.id || session.user.role !== "CONSUMER") {
    return null;
  }

  const result = generatePersonalityResult(answers);
  const existing = await prisma.userProfile.findUnique({ where: { customerId: session.user.id } });
  const previousTags = existing?.tags && typeof existing.tags === "object" ? (existing.tags as { labels?: string[] }) : {};
  const labels = Array.from(new Set([...(previousTags.labels ?? []), `性格:${result.title}`, `互动偏好:${result.category}`]));
  await prisma.userProfile.upsert({
    where: { customerId: session.user.id },
    update: { tags: { ...previousTags, labels, personality: result, answers }, preferredCategories: [result.category], lastAnalyzedAt: new Date() },
    create: {
      customerId: session.user.id,
      preferredCategories: [result.category],
      tags: { labels, personality: result, answers },
    },
  });
  return result;
}

export async function getCheckInState() {
  const session = await auth();
  if (!session?.user.id || session.user.role !== "CONSUMER") {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recent = await prisma.checkIn.findMany({
    where: { customerId: session.user.id },
    orderBy: { date: "desc" },
    take: 30,
  });
  return {
    checkedToday: recent.some((item) => item.date.getTime() === today.getTime()),
    recent: recent.map((item) => ({ date: item.date.toISOString(), points: item.points, streak: item.streak })),
  };
}
