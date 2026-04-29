import type { DealerPriceLevel, InquiryStatus, LeadScene, LeadSource, LeadStatus, PromoterOwnerType, QuoteStatus } from "@prisma/client";

export const leadSceneLabels: Record<LeadScene, string> = {
  BANQUET: "宴席配酒",
  GROUP_BUY: "企业团购",
  RESTOCK: "门店补货",
  GIFT: "送礼推荐",
  NEW_PRODUCT_TRIAL: "新品试饮",
  RETAIL: "普通购买",
  DEALER_JOIN: "经销商加入",
  OTHER: "其他",
};

export const leadSourceLabels: Record<LeadSource, string> = {
  SHOP: "客户入口",
  WECHAT_MINI: "微信小程序",
  WECHAT_OFFICIAL: "公众号",
  SALESPERSON_CODE: "业务员推广码",
  DEALER_CODE: "经销商推广码",
  AI_INTERACTION: "AI互动",
  MANUAL: "后台录入",
};

export const leadStatusLabels: Record<LeadStatus, string> = {
  NEW: "新线索",
  ASSIGNED: "已分派",
  FOLLOWING: "跟进中",
  CONVERTED: "已转化",
  LOST: "已流失",
};

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  NEW: "新询价",
  ASSIGNED: "已分派",
  QUOTED: "已报价",
  WON: "已成交",
  LOST: "未成交",
  CANCELLED: "已取消",
};

export const promoterOwnerTypeLabels: Record<PromoterOwnerType, string> = {
  SALESPERSON: "业务员",
  DEALER: "经销商",
  CAMPAIGN: "活动",
};

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  DRAFT: "草稿",
  SENT: "已发送",
  ACCEPTED: "已接受",
  REJECTED: "已拒绝",
  EXPIRED: "已过期",
  CONVERTED: "已转订单",
};

export const dealerPriceLevelLabels: Record<DealerPriceLevel, string> = {
  RETAIL: "零售价",
  WHOLESALE: "批发价",
  VIP: "重点客户价",
};

export const leadStatusClasses: Record<LeadStatus, string> = {
  NEW: "bg-blue-50 text-blue-700",
  ASSIGNED: "bg-indigo-50 text-indigo-700",
  FOLLOWING: "bg-amber-50 text-amber-700",
  CONVERTED: "bg-emerald-50 text-emerald-700",
  LOST: "bg-slate-100 text-slate-500",
};

export const inquiryStatusClasses: Record<InquiryStatus, string> = {
  NEW: "bg-blue-50 text-blue-700",
  ASSIGNED: "bg-indigo-50 text-indigo-700",
  QUOTED: "bg-purple-50 text-purple-700",
  WON: "bg-emerald-50 text-emerald-700",
  LOST: "bg-slate-100 text-slate-500",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export const quoteStatusClasses: Record<QuoteStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SENT: "bg-blue-50 text-blue-700",
  ACCEPTED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  EXPIRED: "bg-amber-50 text-amber-700",
  CONVERTED: "bg-purple-50 text-purple-700",
};
