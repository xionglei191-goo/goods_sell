# Phase 6：运营支撑模块 — 开发规格书

> 负责人：代码组 | 审核人：架构师 | 工期：Day 17~21

## Step 6.1 仓储作业

- 路由：`/dashboard/warehouse`
- 功能：仓储概览、库存预警、安全库存行内编辑、出入库动态、盘点任务、新建盘点、盘点详情确认。
- 验收：概览 4 卡片正确；`stock <= safeStock` 预警；盘点确认后自动生成 `StockRecord` 并调整库存。

## Step 6.2 物流配送

- 路由：`/dashboard/delivery`
- 功能：配送概览、配送单列表、筛选、标记发货、确认送达、配送详情与分单路由。
- 验收：发货同步 `Order.status=SHIPPING` 和 `Delivery.status=SHIPPING`；送达同步 `DELIVERED`；时间线正确。

## Step 6.3 票据记录

- 路由：`/dashboard/receipts`
- 功能：收付款单据、CSV 导出、电子发票、Mock 税控开票。
- 验收：票据卡片正确；发票从已收款订单生成；未配置税控时 `provider=MOCK` 且生成模拟发票号。

## Step 6.4 系统设置

- 路由：`/dashboard/settings`、`/dashboard/settings/users`
- 功能：业务参数、用户管理、角色分配、启用禁用、重置密码、集成状态。
- 验收：参数写入 `SystemConfig`；用户管理动作写入审计日志；非 ADMIN 被 middleware 拦截。

## Step 6.5 操作日志

- 路由：`/dashboard/logs`
- 功能：关键操作审计、筛选、分页、JSON 详情、管理员手动清除。
- 验收：订单、库存、商品、收款、用户、票据等关键模块自动记录；清除日志需二次确认且写入清除记录。

## 外部依赖

- 税控电子发票接口需航信/百旺等平台配置；未配置时使用 Mock 模式。
