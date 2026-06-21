import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type OperationalAcceptanceSeverity = "BLOCKER" | "WARNING" | "READY";
export type OperationalAcceptanceArea = "业务签收" | "真实环境" | "合规联调" | "运维演练";

export type OperationalAcceptanceItem = {
  key: string;
  area: OperationalAcceptanceArea;
  label: string;
  severity: OperationalAcceptanceSeverity;
  summary: string;
  evidence: string[];
  action: string;
  href?: string;
};

export type OperationalAcceptanceReport = {
  checkedAt: string;
  status: OperationalAcceptanceSeverity;
  readyCount: number;
  warningCount: number;
  blockerCount: number;
  items: OperationalAcceptanceItem[];
};

function has(path: string) {
  return existsSync(join(process.cwd(), path));
}

function read(path: string) {
  const fullPath = join(process.cwd(), path);
  return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
}

function includes(path: string, needle: string) {
  return read(path).includes(needle);
}

function item(params: OperationalAcceptanceItem) {
  return params;
}

export function getOperationalAcceptanceReport(): OperationalAcceptanceReport {
  const templateReady = has("docs/14-正式上线验收记录模板.md");
  const items: OperationalAcceptanceItem[] = [
    item({
      key: "business_owner_signoff",
      area: "业务签收",
      label: "业务负责人签收",
      severity: templateReady ? "WARNING" : "BLOCKER",
      summary: "自动化只能证明程序行为，不能替代业务负责人对价格、库存、账号权限和运营 SOP 的签收。",
      evidence: ["docs/14-正式上线验收记录模板.md"],
      action: "由业务、财务、仓管、客服/销售和经销商代表完成正式签收；签收前不建议公开上线。",
      href: "/dashboard/settings",
    }),
    item({
      key: "price_inventory_account_review",
      area: "业务签收",
      label: "价格、库存和账号权限复核",
      severity: templateReady && ["价格复核", "库存盘点", "账号权限复核"].every((entry) => includes("docs/14-正式上线验收记录模板.md", entry)) ? "WARNING" : "BLOCKER",
      summary: "上线前需要人工复核商品售价、库存盘点结果、员工账号、角色权限和经销商账号状态。",
      evidence: ["docs/14-正式上线验收记录模板.md", "/dashboard/products", "/dashboard/inventory", "/dashboard/settings/users"],
      action: "按正式上线验收模板逐项填写负责人、时间和证据位置。",
      href: "/dashboard/settings/users",
    }),
    item({
      key: "real_device_acceptance",
      area: "真实环境",
      label: "真实设备和微信内置浏览器验收",
      severity: templateReady ? "WARNING" : "BLOCKER",
      summary: "Chrome/Edge 本地 smoke 不能替代 iOS、Android、微信内置浏览器和小程序体验版的真实端验收。",
      evidence: ["docs/14-正式上线验收记录模板.md", "npm run test:browser-compat"],
      action: "用真实设备复核登录、下单、AI 浮窗、支付、分享和订单查询，并留痕。",
    }),
    item({
      key: "wechat_pay_tax_acceptance",
      area: "合规联调",
      label: "微信、支付、税控和酒类资质联调",
      severity: templateReady ? "WARNING" : "BLOCKER",
      summary: "真实小额支付、支付回调、公众号菜单、小程序体验版、税控联调和酒类资质复核属于运营验收，不属于程序完整度缺陷。",
      evidence: ["docs/14-正式上线验收记录模板.md", "npm run check:launch", "npm run test:third-party"],
      action: "真实配置齐备后完成小额支付、菜单发布、小程序体验版、税控开票和资质复核签收。",
      href: "/dashboard/wechat",
    }),
    item({
      key: "backup_restore_drill",
      area: "运维演练",
      label: "备份恢复和回滚演练",
      severity: templateReady ? "WARNING" : "BLOCKER",
      summary: "上线运营接手前需要证明生产备份、恢复、迁移回滚和日志巡检流程可执行。",
      evidence: ["docs/08-部署方案.md", "docs/14-正式上线验收记录模板.md"],
      action: "在受控环境执行一次备份恢复演练，记录负责人、耗时、恢复点和问题处理。",
    }),
  ];

  const blockerCount = items.filter((entry) => entry.severity === "BLOCKER").length;
  const warningCount = items.filter((entry) => entry.severity === "WARNING").length;
  const readyCount = items.filter((entry) => entry.severity === "READY").length;

  return {
    checkedAt: new Date().toISOString(),
    status: blockerCount > 0 ? "BLOCKER" : warningCount > 0 ? "WARNING" : "READY",
    readyCount,
    warningCount,
    blockerCount,
    items,
  };
}
