import type { z } from "zod";

import type { DashboardPermission, AppRole } from "@/features/auth/permissions";
import type { SessionUser } from "@/features/auth/guards";

export type AiToolRiskLevel = "READ" | "DRAFT" | "WRITE" | "HIGH_RISK";

export type AiToolContext = {
  user: SessionUser;
  role: AppRole;
  isStaff: boolean;
};

export type AiToolDetail = {
  label: string;
  value: string;
};

export type AiToolResult = {
  title: string;
  summary: string;
  details?: AiToolDetail[];
  href?: string;
  data?: unknown;
};

export type AiPendingAction = {
  toolName: string;
  args: Record<string, unknown>;
  confirmationToken: string;
  riskLevel: AiToolRiskLevel;
  title: string;
  summary: string;
  details: AiToolDetail[];
  confirmLabel: string;
  confirmTextRequired?: string;
};

export type AiAssistantCard =
  | {
      kind: "result";
      title: string;
      summary: string;
      details: AiToolDetail[];
      href?: string;
    }
  | {
      kind: "confirmation";
      pendingAction: AiPendingAction;
    };

export type AiToolAccess = {
  roles?: readonly AppRole[];
  permission?: DashboardPermission;
};

export type AnyToolInput = Record<string, unknown> & {
  action: "confirm" | "ship" | "deliver" | "complete" | "cancel";
  addressId?: string | null;
  adjustRetailPrice?: number;
  allowCrossZone?: boolean;
  allowReject?: boolean;
  amount: number;
  brandQueries?: string[];
  buyerAddress?: string;
  buyerBank?: string;
  buyerBankAccount?: string;
  buyerName: string;
  buyerPhone?: string;
  buyerTaxNo?: string;
  businessLicense?: string;
  confirmText?: string;
  couponQuery?: string;
  couponType?: "AMOUNT" | "PERCENT";
  creditLimit?: number;
  customerQuery: string;
  customerType?: "CONSUMER" | "DEALER";
  dealerQuery?: string;
  endsAt?: string;
  isActive: boolean;
  key: string;
  latitude?: number;
  leadQuery?: string;
  limit: number;
  longitude?: number;
  maxOrderAmount?: number;
  message?: string;
  method: "WECHAT" | "CASH" | "TRANSFER";
  minOrderAmount?: number;
  mode?: "replace" | "add" | "remove";
  name: string;
  newRetailPrice?: number;
  notes?: string;
  orderNo: string;
  password: string;
  payMethod?: "WECHAT" | "CASH" | "TRANSFER" | "CREDIT";
  percent?: number;
  period: "day" | "week" | "month";
  phone: string;
  priceLevel?: "RETAIL" | "WHOLESALE" | "VIP";
  priority?: number;
  productQuery: string;
  query: string;
  quantity: number;
  reason: string;
  rejectLimitPerDay?: number;
  remark?: string;
  role: "ADMIN" | "SALESPERSON" | "WAREHOUSE" | "FINANCE";
  routingId: string;
  safeStock: number;
  salesPersonQuery?: string;
  salespersonName: string;
  serviceRadius?: number;
  shopName?: string;
  startsAt?: string;
  status: "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK";
  stock: number;
  sort?: "sales_desc" | "stock_desc" | "stock_asc";
  tag?: string;
  tags?: string[];
  targetTag?: string;
  text: string;
  threshold?: number;
  totalQuantity?: number;
  type: "NORMAL" | "SPECIAL";
  userQuery: string;
  value: number;
  zone?: string;
};

export type AiToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  title: string;
  description: string;
  capabilities?: readonly string[];
  examples?: readonly string[];
  argumentHints?: string;
  inputSchema: TSchema;
  riskLevel: AiToolRiskLevel;
  access?: AiToolAccess;
  resolvePermission?: (input: AnyToolInput, context: AiToolContext) => DashboardPermission | null;
  handler: (input: AnyToolInput, context: AiToolContext) => Promise<AiToolResult>;
  buildConfirmation?: (input: AnyToolInput, context: AiToolContext) => Promise<Omit<AiPendingAction, "toolName" | "args" | "confirmationToken" | "riskLevel">>;
};

export type AiToolExecution =
  | {
      status: "success";
      toolName: string;
      result: AiToolResult;
      card: AiAssistantCard;
    }
  | {
      status: "needs_confirmation";
      toolName: string;
      pendingAction: AiPendingAction;
      card: AiAssistantCard;
    };

export type AiToolPlan = {
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  intent?: string;
  confidence?: number;
  missingSlots?: string[];
};
