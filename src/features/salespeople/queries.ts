import type { Prisma } from "@prisma/client";

import { firstParam } from "@/features/orders/utils";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

const revenueStatuses = ["PAID", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED"] as const;

export type SalespersonListItem = {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  customerCount: number;
  dealerCount: number;
  consumerCustomerCount: number;
  leadCount: number;
  convertedLeadCount: number;
  leadConversionRate: number;
  inquiryCount: number;
  quotedInquiryCount: number;
  wonInquiryCount: number;
  quoteCount: number;
  convertedQuoteCount: number;
  quoteConversionRate: number;
  promoterScanCount: number;
  promoterLeadCount: number;
  promoterOrderCount: number;
  orderCount: number;
  revenue: number;
  receivable: number;
  avgOrderAmount: number;
  buyingCustomerCount: number;
  repeatCustomerCount: number;
  repeatRate: number;
  lastOrderAt: string | null;
};

export async function getSalespersonManagementData(searchParams: SearchParams) {
  const filters = {
    q: firstParam(searchParams.q),
    status: firstParam(searchParams.status),
  };

  const where: Prisma.UserWhereInput = {
    role: "SALESPERSON",
    ...(filters.status === "active" ? { isActive: true } : {}),
    ...(filters.status === "inactive" ? { isActive: false } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" } },
            { phone: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const salespeople = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      phone: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  const salespersonIds = salespeople.map((person) => person.id);
  const [orders, assignedCustomers, leads, inquiries, quotes, promoterCodes] = await Promise.all([
    prisma.order.findMany({
      where: {
        parentId: null,
        status: { in: [...revenueStatuses] },
        OR: [
          { salesPersonId: { in: salespersonIds } },
          {
            salesPersonId: null,
            customer: { salesPersonId: { in: salespersonIds } },
          },
        ],
      },
      select: {
        id: true,
        customerId: true,
        salesPersonId: true,
        payableAmount: true,
        paidAmount: true,
        createdAt: true,
        customer: { select: { salesPersonId: true } },
      },
    }),
    prisma.customer.findMany({
      where: { salesPersonId: { in: salespersonIds } },
      select: {
        id: true,
        type: true,
        salesPersonId: true,
        dealer: { select: { id: true } },
      },
    }),
    prisma.lead.findMany({
      where: { salespersonId: { in: salespersonIds } },
      select: { id: true, salespersonId: true, status: true },
    }),
    prisma.inquiry.findMany({
      where: { salespersonId: { in: salespersonIds } },
      select: { id: true, salespersonId: true, status: true },
    }),
    prisma.quote.findMany({
      where: { createdById: { in: salespersonIds } },
      select: { id: true, createdById: true, status: true, convertedOrderId: true },
    }),
    prisma.promoterCode.findMany({
      where: { ownerType: "SALESPERSON", salespersonId: { in: salespersonIds }, isActive: true },
      select: { id: true, salespersonId: true, scanCount: true, leadCount: true, orderCount: true },
    }),
  ]);

  const statMap = new Map<
    string,
    {
      orderCount: number;
      revenue: number;
      receivable: number;
      lastOrderAt: Date | null;
      customerOrders: Map<string, number>;
    }
  >();
  const customerStatMap = new Map<string, { customerCount: number; dealerCount: number; consumerCustomerCount: number }>();
  const leadStatMap = new Map<string, { total: number; converted: number }>();
  const inquiryStatMap = new Map<string, { total: number; quoted: number; won: number }>();
  const quoteStatMap = new Map<string, { total: number; converted: number }>();
  const codeStatMap = new Map<string, { scans: number; leads: number; orders: number }>();

  for (const id of salespersonIds) {
    statMap.set(id, { orderCount: 0, revenue: 0, receivable: 0, lastOrderAt: null, customerOrders: new Map() });
    customerStatMap.set(id, { customerCount: 0, dealerCount: 0, consumerCustomerCount: 0 });
    leadStatMap.set(id, { total: 0, converted: 0 });
    inquiryStatMap.set(id, { total: 0, quoted: 0, won: 0 });
    quoteStatMap.set(id, { total: 0, converted: 0 });
    codeStatMap.set(id, { scans: 0, leads: 0, orders: 0 });
  }

  for (const customer of assignedCustomers) {
    if (!customer.salesPersonId) continue;

    const current = customerStatMap.get(customer.salesPersonId);
    if (!current) continue;

    current.customerCount += 1;
    if (customer.type === "DEALER" || customer.dealer) {
      current.dealerCount += 1;
    } else {
      current.consumerCustomerCount += 1;
    }
  }

  for (const order of orders) {
    const salespersonId = order.salesPersonId ?? order.customer.salesPersonId;
    if (!salespersonId) continue;

    const current = statMap.get(salespersonId);
    if (!current) continue;

    const payableAmount = Number(order.payableAmount);
    const paidAmount = Number(order.paidAmount);
    current.orderCount += 1;
    current.revenue += payableAmount;
    current.receivable += Math.max(0, payableAmount - paidAmount);
    current.lastOrderAt = !current.lastOrderAt || order.createdAt > current.lastOrderAt ? order.createdAt : current.lastOrderAt;
    current.customerOrders.set(order.customerId, (current.customerOrders.get(order.customerId) ?? 0) + 1);
  }

  for (const lead of leads) {
    if (!lead.salespersonId) continue;

    const current = leadStatMap.get(lead.salespersonId);
    if (!current) continue;

    current.total += 1;
    if (lead.status === "CONVERTED") current.converted += 1;
  }

  for (const inquiry of inquiries) {
    if (!inquiry.salespersonId) continue;

    const current = inquiryStatMap.get(inquiry.salespersonId);
    if (!current) continue;

    current.total += 1;
    if (inquiry.status === "QUOTED" || inquiry.status === "WON") current.quoted += 1;
    if (inquiry.status === "WON") current.won += 1;
  }

  for (const quote of quotes) {
    if (!quote.createdById) continue;

    const current = quoteStatMap.get(quote.createdById);
    if (!current) continue;

    current.total += 1;
    if (quote.status === "CONVERTED" || quote.convertedOrderId) current.converted += 1;
  }

  for (const code of promoterCodes) {
    if (!code.salespersonId) continue;

    const current = codeStatMap.get(code.salespersonId);
    if (!current) continue;

    current.scans += code.scanCount;
    current.leads += code.leadCount;
    current.orders += code.orderCount;
  }

  const items: SalespersonListItem[] = salespeople.map((person) => {
    const stats = statMap.get(person.id) ?? { orderCount: 0, revenue: 0, receivable: 0, lastOrderAt: null, customerOrders: new Map<string, number>() };
    const customerStats = customerStatMap.get(person.id) ?? { customerCount: 0, dealerCount: 0, consumerCustomerCount: 0 };
    const leadStats = leadStatMap.get(person.id) ?? { total: 0, converted: 0 };
    const inquiryStats = inquiryStatMap.get(person.id) ?? { total: 0, quoted: 0, won: 0 };
    const quoteStats = quoteStatMap.get(person.id) ?? { total: 0, converted: 0 };
    const codeStats = codeStatMap.get(person.id) ?? { scans: 0, leads: 0, orders: 0 };
    const buyingCustomerCount = stats.customerOrders.size;
    const repeatCustomerCount = Array.from(stats.customerOrders.values()).filter((count) => count >= 2).length;

    return {
      id: person.id,
      name: person.name,
      phone: person.phone,
      isActive: person.isActive,
      createdAt: person.createdAt.toISOString(),
      customerCount: customerStats.customerCount,
      dealerCount: customerStats.dealerCount,
      consumerCustomerCount: customerStats.consumerCustomerCount,
      leadCount: leadStats.total,
      convertedLeadCount: leadStats.converted,
      leadConversionRate: leadStats.total > 0 ? leadStats.converted / leadStats.total : 0,
      inquiryCount: inquiryStats.total,
      quotedInquiryCount: inquiryStats.quoted,
      wonInquiryCount: inquiryStats.won,
      quoteCount: quoteStats.total,
      convertedQuoteCount: quoteStats.converted,
      quoteConversionRate: quoteStats.total > 0 ? quoteStats.converted / quoteStats.total : 0,
      promoterScanCount: codeStats.scans,
      promoterLeadCount: codeStats.leads,
      promoterOrderCount: codeStats.orders,
      orderCount: stats.orderCount,
      revenue: stats.revenue,
      receivable: stats.receivable,
      avgOrderAmount: stats.orderCount > 0 ? stats.revenue / stats.orderCount : 0,
      buyingCustomerCount,
      repeatCustomerCount,
      repeatRate: buyingCustomerCount > 0 ? repeatCustomerCount / buyingCustomerCount : 0,
      lastOrderAt: stats.lastOrderAt?.toISOString() ?? null,
    };
  });

  const totalLeads = items.reduce((sum, item) => sum + item.leadCount, 0);
  const convertedLeads = items.reduce((sum, item) => sum + item.convertedLeadCount, 0);
  const totalQuotes = items.reduce((sum, item) => sum + item.quoteCount, 0);
  const convertedQuotes = items.reduce((sum, item) => sum + item.convertedQuoteCount, 0);
  const buyingCustomers = items.reduce((sum, item) => sum + item.buyingCustomerCount, 0);
  const repeatCustomers = items.reduce((sum, item) => sum + item.repeatCustomerCount, 0);

  return {
    filters,
    summary: {
      total: items.length,
      active: items.filter((item) => item.isActive).length,
      customers: items.reduce((sum, item) => sum + item.customerCount, 0),
      dealers: items.reduce((sum, item) => sum + item.dealerCount, 0),
      leads: totalLeads,
      convertedLeads,
      leadConversionRate: totalLeads > 0 ? convertedLeads / totalLeads : 0,
      quotes: totalQuotes,
      convertedQuotes,
      quoteConversionRate: totalQuotes > 0 ? convertedQuotes / totalQuotes : 0,
      buyingCustomers,
      repeatCustomers,
      repeatRate: buyingCustomers > 0 ? repeatCustomers / buyingCustomers : 0,
      promoterScans: items.reduce((sum, item) => sum + item.promoterScanCount, 0),
      revenue: items.reduce((sum, item) => sum + item.revenue, 0),
      receivable: items.reduce((sum, item) => sum + item.receivable, 0),
    },
    items,
  };
}

export async function getDealerPilotData() {
  const [salespeople, dealers, salespersonCodes] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SALESPERSON" },
      select: { id: true, name: true, phone: true, isActive: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.dealer.findMany({
      select: {
        id: true,
        shopName: true,
        zone: true,
        isAccepting: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            salesPersonId: true,
            salesPerson: { select: { id: true, name: true, phone: true } },
          },
        },
        promoterCodes: {
          where: { isActive: true },
          select: { id: true, code: true, ownerType: true, scene: true, scanCount: true, leadCount: true, orderCount: true },
          orderBy: { createdAt: "desc" },
        },
        leads: { select: { id: true } },
        inquiries: { select: { id: true } },
        routings: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.promoterCode.findMany({
      where: { ownerType: "SALESPERSON", isActive: true, salespersonId: { not: null } },
      select: { id: true, code: true, salespersonId: true, scene: true, scanCount: true, leadCount: true, orderCount: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const dealerCountBySalesperson = new Map<string, number>();
  for (const dealer of dealers) {
    const salespersonId = dealer.customer.salesPersonId;
    if (!salespersonId) continue;
    dealerCountBySalesperson.set(salespersonId, (dealerCountBySalesperson.get(salespersonId) ?? 0) + 1);
  }

  const codeStatsBySalesperson = new Map<string, { codeCount: number; scans: number; leads: number; orders: number }>();
  for (const code of salespersonCodes) {
    if (!code.salespersonId) continue;
    const current = codeStatsBySalesperson.get(code.salespersonId) ?? { codeCount: 0, scans: 0, leads: 0, orders: 0 };
    current.codeCount += 1;
    current.scans += code.scanCount;
    current.leads += code.leadCount;
    current.orders += code.orderCount;
    codeStatsBySalesperson.set(code.salespersonId, current);
  }

  const salespersonItems = salespeople.map((person) => {
    const codeStats = codeStatsBySalesperson.get(person.id) ?? { codeCount: 0, scans: 0, leads: 0, orders: 0 };
    return {
      id: person.id,
      name: person.name,
      phone: person.phone,
      isActive: person.isActive,
      assignedDealerCount: dealerCountBySalesperson.get(person.id) ?? 0,
      codeCount: codeStats.codeCount,
      scans: codeStats.scans,
      leads: codeStats.leads,
      orders: codeStats.orders,
    };
  });

  const dealerItems = dealers.map((dealer) => {
    const generalCode = dealer.promoterCodes.find((code) => code.ownerType === "DEALER" && code.scene === null) ?? null;
    const scans = dealer.promoterCodes.reduce((sum, code) => sum + code.scanCount, 0);
    const leads = dealer.promoterCodes.reduce((sum, code) => sum + code.leadCount, 0);
    const orders = dealer.promoterCodes.reduce((sum, code) => sum + code.orderCount, 0);
    return {
      id: dealer.id,
      shopName: dealer.shopName,
      zone: dealer.zone,
      isAccepting: dealer.isAccepting,
      customerName: dealer.customer.name,
      customerPhone: dealer.customer.phone,
      salespersonId: dealer.customer.salesPersonId,
      salespersonName: dealer.customer.salesPerson?.name ?? "未绑定",
      generalCode: generalCode?.code ?? null,
      codeCount: dealer.promoterCodes.length,
      scans,
      leads,
      inquiries: dealer.inquiries.length,
      orders,
      acceptedOrders: dealer.routings.filter((routing) => routing.status === "ACCEPTED").length,
    };
  });

  return {
    summary: {
      salespeople: salespersonItems.length,
      activeSalespeople: salespersonItems.filter((item) => item.isActive).length,
      dealers: dealerItems.length,
      assignedDealers: dealerItems.filter((item) => item.salespersonId).length,
      unassignedDealers: dealerItems.filter((item) => !item.salespersonId).length,
      activeCodes: salespersonCodes.length + dealerItems.reduce((sum, item) => sum + item.codeCount, 0),
    },
    salespeople: salespersonItems,
    dealers: dealerItems,
  };
}

export type DealerPilotData = Awaited<ReturnType<typeof getDealerPilotData>>;
