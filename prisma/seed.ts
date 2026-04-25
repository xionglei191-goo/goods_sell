import { PrismaClient, CustomerType, ProductStatus, PurchaseStatus, StockType, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const hashPassword = (password: string) => bcrypt.hash(password, 12);

const productImage = (sku: string) => `/images/products/${sku}.png`;

async function resetDatabase() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.systemConfig.deleteMany(),
    prisma.customerCoupon.deleteMany(),
    prisma.wechatShareEvent.deleteMany(),
    prisma.wechatMessageLog.deleteMany(),
    prisma.integrationCache.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.chatHistory.deleteMany(),
    prisma.userProfile.deleteMany(),
    prisma.dealerStock.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.customerVisit.deleteMany(),
    prisma.customerTag.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.stockCheckItem.deleteMany(),
    prisma.stockCheck.deleteMany(),
    prisma.stockRecord.deleteMany(),
    prisma.delivery.deleteMany(),
    prisma.orderRouting.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.purchaseItem.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.product.deleteMany(),
    prisma.dealer.deleteMany(),
    prisma.address.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.brand.deleteMany(),
    prisma.category.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function seedUsers() {
  const [adminPassword, salesPassword, warehousePassword, financePassword] = await Promise.all([
    hashPassword("admin123"),
    hashPassword("sales123"),
    hashPassword("warehouse123"),
    hashPassword("finance123"),
  ]);

  const admin = await prisma.user.create({
    data: {
      name: "系统管理员",
      phone: "admin",
      password: adminPassword,
      role: UserRole.ADMIN,
    },
  });

  const salesperson = await prisma.user.create({
    data: {
      name: "销售一部-李明",
      phone: "13800138001",
      password: salesPassword,
      role: UserRole.SALESPERSON,
    },
  });

  const warehouse = await prisma.user.create({
    data: {
      name: "仓库主管-周强",
      phone: "13800138002",
      password: warehousePassword,
      role: UserRole.WAREHOUSE,
    },
  });

  const finance = await prisma.user.create({
    data: {
      name: "财务-王敏",
      phone: "13800138003",
      password: financePassword,
      role: UserRole.FINANCE,
    },
  });

  return { admin, salesperson, warehouse, finance };
}

async function seedCategories() {
  const categories = new Map<string, { id: string }>();

  async function createCategory(key: string, name: string, sortOrder: number, parentKey?: string, icon?: string) {
    const parent = parentKey ? categories.get(parentKey) : undefined;
    const category = await prisma.category.create({
      data: {
        name,
        sortOrder,
        icon,
        parentId: parent?.id,
      },
      select: { id: true },
    });
    categories.set(key, category);
    return category;
  }

  await createCategory("wine", "酒类", 1, undefined, "Wine");
  await createCategory("food", "食品", 2, undefined, "Cookie");
  await createCategory("drink", "饮料", 3, undefined, "CupSoda");

  await createCategory("baijiu", "白酒", 1, "wine");
  await createCategory("beer", "啤酒", 2, "wine");
  await createCategory("red-wine", "红酒", 3, "wine");
  await createCategory("foreign-wine", "洋酒", 4, "wine");

  await createCategory("jiangxiang", "酱香型", 1, "baijiu");
  await createCategory("nongxiang", "浓香型", 2, "baijiu");
  await createCategory("qingxiang", "清香型", 3, "baijiu");

  await createCategory("snack", "休闲食品", 1, "food");
  await createCategory("seasoning", "调味品", 2, "food");
  await createCategory("instant-food", "方便食品", 3, "food");

  await createCategory("soda", "碳酸饮料", 1, "drink");
  await createCategory("juice", "果汁饮料", 2, "drink");
  await createCategory("tea", "茶饮料", 3, "drink");
  await createCategory("energy", "功能饮料", 4, "drink");

  return categories;
}

async function seedBrands() {
  const brandData = [
    ["maotai", "茅台", "酱香白酒代表品牌"],
    ["wuliangye", "五粮液", "浓香白酒代表品牌"],
    ["tsingtao", "青岛啤酒", "经典啤酒品牌"],
    ["coca-cola", "可口可乐", "全球饮料品牌"],
    ["nongfu", "农夫山泉", "饮用水和饮料品牌"],
    ["changyu", "张裕", "国产葡萄酒品牌"],
    ["master-kong", "康师傅", "方便食品与饮品品牌"],
    ["haitian", "海天", "家庭调味品品牌"],
  ] as const;

  const brands = new Map<string, { id: string }>();
  for (const [key, name, description] of brandData) {
    const brand = await prisma.brand.create({
      data: { name, description },
      select: { id: true },
    });
    brands.set(key, brand);
  }
  return brands;
}

async function seedProducts(
  categories: Map<string, { id: string }>,
  brands: Map<string, { id: string }>,
  operatorId: string,
) {
  const products = [
    ["HQ-BJ-001", "茅台王子酒 酱香型 500ml", "jiangxiang", "maotai", "瓶", "500ml", "168.00", "198.00", "238.00", "218.00", 120, 30, 6],
    ["HQ-BJ-002", "五粮液特曲 浓香型 500ml", "nongxiang", "wuliangye", "瓶", "500ml", "128.00", "158.00", "198.00", "178.00", 18, 24, 8],
    ["HQ-BJ-003", "汾香清雅白酒 清香型 475ml", "qingxiang", "maotai", "瓶", "475ml", "58.00", "78.00", "99.00", "89.00", 160, 40, 12],
    ["HQ-BEER-001", "青岛经典啤酒 500ml*12", "beer", "tsingtao", "箱", "500ml*12", "48.00", "58.00", "72.00", "66.00", 240, 60, 20],
    ["HQ-BEER-002", "青岛纯生啤酒 500ml*12", "beer", "tsingtao", "箱", "500ml*12", "62.00", "78.00", "96.00", "88.00", 180, 50, 18],
    ["HQ-BEER-003", "青岛白啤 500ml*12", "beer", "tsingtao", "箱", "500ml*12", "72.00", "89.00", "108.00", "99.00", 140, 40, 16],
    ["HQ-RW-001", "张裕解百纳干红 750ml", "red-wine", "changyu", "瓶", "750ml", "45.00", "59.00", "79.00", "69.00", 110, 24, 10],
    ["HQ-RW-002", "张裕优选赤霞珠 750ml", "red-wine", "changyu", "瓶", "750ml", "68.00", "88.00", "118.00", "99.00", 80, 20, 8],
    ["HQ-RW-003", "华启精选红葡萄酒 750ml", "red-wine", "wuliangye", "瓶", "750ml", "36.00", "49.00", "68.00", "59.00", 100, 30, 12],
    ["HQ-FW-001", "进口调和威士忌 700ml", "foreign-wine", "wuliangye", "瓶", "700ml", "88.00", "118.00", "158.00", "138.00", 8, 12, 6],
    ["HQ-FW-002", "经典白兰地 700ml", "foreign-wine", "changyu", "瓶", "700ml", "76.00", "98.00", "139.00", "119.00", 9, 12, 6],
    ["HQ-FW-003", "轻饮鸡尾酒 275ml*6", "foreign-wine", "coca-cola", "箱", "275ml*6", "38.00", "49.00", "68.00", "59.00", 90, 24, 12],
    ["HQ-SNACK-001", "香脆薯片组合装", "snack", "coca-cola", "袋", "220g", "8.00", "11.00", "15.00", "13.00", 300, 80, 30],
    ["HQ-SNACK-002", "坚果每日装", "snack", "nongfu", "盒", "750g", "42.00", "55.00", "69.00", "62.00", 130, 35, 12],
    ["HQ-SNACK-003", "肉脯休闲礼包", "snack", "master-kong", "盒", "500g", "38.00", "49.00", "65.00", "58.00", 96, 24, 10],
    ["HQ-SEASON-001", "海天金标生抽 1.9L", "seasoning", "haitian", "瓶", "1.9L", "12.00", "16.00", "22.00", "19.00", 220, 60, 24],
    ["HQ-SEASON-002", "海天蚝油 700g", "seasoning", "haitian", "瓶", "700g", "6.50", "8.50", "12.00", "10.00", 260, 60, 30],
    ["HQ-SEASON-003", "家用辣酱组合", "seasoning", "haitian", "组", "280g*3", "15.00", "20.00", "28.00", "25.00", 160, 40, 20],
    ["HQ-INSTANT-001", "康师傅红烧牛肉面 12桶", "instant-food", "master-kong", "箱", "12桶", "42.00", "52.00", "66.00", "59.00", 200, 50, 20],
    ["HQ-INSTANT-002", "康师傅老坛酸菜面 12桶", "instant-food", "master-kong", "箱", "12桶", "42.00", "52.00", "66.00", "59.00", 180, 50, 20],
    ["HQ-INSTANT-003", "方便自热米饭 6盒", "instant-food", "nongfu", "箱", "6盒", "58.00", "72.00", "88.00", "80.00", 80, 24, 10],
    ["HQ-SODA-001", "可口可乐 330ml*24", "soda", "coca-cola", "箱", "330ml*24", "42.00", "52.00", "68.00", "60.00", 320, 80, 30],
    ["HQ-SODA-002", "雪碧 330ml*24", "soda", "coca-cola", "箱", "330ml*24", "42.00", "52.00", "68.00", "60.00", 280, 80, 30],
    ["HQ-SODA-003", "芬达橙味 330ml*24", "soda", "coca-cola", "箱", "330ml*24", "42.00", "52.00", "68.00", "60.00", 220, 70, 30],
    ["HQ-JUICE-001", "农夫山泉NFC橙汁 300ml*12", "juice", "nongfu", "箱", "300ml*12", "48.00", "59.00", "76.00", "69.00", 150, 40, 18],
    ["HQ-JUICE-002", "果粒橙 450ml*15", "juice", "coca-cola", "箱", "450ml*15", "52.00", "65.00", "82.00", "75.00", 140, 40, 18],
    ["HQ-JUICE-003", "农夫混合果汁 380ml*15", "juice", "nongfu", "箱", "380ml*15", "56.00", "68.00", "88.00", "80.00", 120, 35, 16],
    ["HQ-TEA-001", "东方树叶绿茶 500ml*15", "tea", "nongfu", "箱", "500ml*15", "50.00", "62.00", "78.00", "70.00", 180, 45, 20],
    ["HQ-TEA-002", "康师傅冰红茶 500ml*15", "tea", "master-kong", "箱", "500ml*15", "38.00", "48.00", "62.00", "56.00", 240, 60, 24],
    ["HQ-TEA-003", "茉莉花茶 500ml*15", "tea", "nongfu", "箱", "500ml*15", "46.00", "58.00", "72.00", "66.00", 150, 40, 20],
    ["HQ-ENERGY-001", "能量饮料 250ml*24", "energy", "coca-cola", "箱", "250ml*24", "72.00", "88.00", "108.00", "98.00", 120, 30, 16],
    ["HQ-ENERGY-002", "维生素运动饮料 600ml*15", "energy", "nongfu", "箱", "600ml*15", "56.00", "69.00", "86.00", "78.00", 160, 40, 18],
    ["HQ-ENERGY-003", "电解质水 500ml*15", "energy", "nongfu", "箱", "500ml*15", "48.00", "60.00", "75.00", "68.00", 200, 50, 20],
  ] as const;

  const createdProducts = [];
  for (const item of products) {
    const [sku, name, categoryKey, brandKey, unit, spec, costPrice, wholesalePrice, retailPrice, memberPrice, stock, safeStock, bulkThreshold] = item;
    const category = categories.get(categoryKey);
    const brand = brands.get(brandKey);
    if (!category || !brand) {
      throw new Error(`Missing category or brand for product ${sku}`);
    }

    const product = await prisma.product.create({
      data: {
        sku,
        name,
        categoryId: category.id,
        brandId: brand.id,
        unit,
        spec,
        costPrice,
        wholesalePrice,
        retailPrice,
        memberPrice,
        stock,
        safeStock,
        bulkThreshold,
        description: `${name}，适合湘潭本地零售和批发配送。`,
        status: stock > 0 ? ProductStatus.ACTIVE : ProductStatus.OUT_OF_STOCK,
        salesCount: Math.floor(stock / 3),
        images: {
          create: {
            url: productImage(sku),
            alt: name,
            isPrimary: true,
          },
        },
      },
    });

    await prisma.stockRecord.create({
      data: {
        productId: product.id,
        type: StockType.IN,
        quantity: stock,
        beforeStock: 0,
        afterStock: stock,
        operatorId,
        remark: "Seed 初始化库存",
      },
    });

    createdProducts.push(product);
  }

  return createdProducts;
}

async function seedCustomers(salesPersonId: string) {
  const password = await hashPassword("customer123");
  const dealerPassword = await hashPassword("dealer123");

  const consumerData = [
    ["张阿姨", "13900139001", "雨湖区", "韶山中路 18 号", "27.856260", "112.913940"],
    ["刘先生", "13900139002", "岳塘区", "建设南路 66 号", "27.835910", "112.944520"],
    ["陈女士", "13900139003", "湘潭县", "易俗河镇凤凰路 8 号", "27.779800", "112.950760"],
    ["周老板", "13900139004", "雨湖区", "熙春路 28 号", "27.862040", "112.905890"],
    ["王老师", "13900139005", "岳塘区", "河东大道 99 号", "27.827610", "112.962520"],
  ] as const;

  const consumers = [];
  for (const [name, phone, district, detail, latitude, longitude] of consumerData) {
    const customer = await prisma.customer.create({
      data: {
        name,
        phone,
        password,
        type: CustomerType.CONSUMER,
        salesPersonId,
        isVerified: true,
        addresses: {
          create: {
            name,
            phone,
            district,
            detail,
            latitude,
            longitude,
            isDefault: true,
          },
        },
        tags: {
          create: [{ name: "本地居民", color: "#10b981", source: "seed" }],
        },
        profile: {
          create: {
            preferredCategories: ["饮料", "食品"],
            tags: ["本地居民", "新客"],
          },
        },
      },
      include: { addresses: true },
    });
    consumers.push(customer);
  }

  const dealerData = [
    ["莲城便利店", "13900139101", "雨湖区", "韶山东路 128 号", "27.858480", "112.917620", 2500],
    ["岳塘烟酒商行", "13900139102", "岳塘区", "双拥中路 88 号", "27.837430", "112.959120", 3000],
    ["易俗河社区超市", "13900139103", "湘潭县", "易俗河镇大鹏中路 36 号", "27.781620", "112.952850", 3500],
  ] as const;

  const dealers = [];
  for (const [shopName, phone, district, detail, latitude, longitude, serviceRadius] of dealerData) {
    const customer = await prisma.customer.create({
      data: {
        name: shopName,
        phone,
        password: dealerPassword,
        type: CustomerType.DEALER,
        creditLimit: "50000.00",
        salesPersonId,
        isVerified: true,
        addresses: {
          create: {
            name: shopName,
            phone,
            district,
            detail,
            latitude,
            longitude,
            isDefault: true,
          },
        },
        dealer: {
          create: {
            shopName,
            latitude,
            longitude,
            serviceRadius,
            zone: district,
            isAccepting: true,
          },
        },
        tags: {
          create: [{ name: "经销商", color: "#3b82f6", source: "seed" }],
        },
        profile: {
          create: {
            spendingLevel: "HIGH",
            preferredCategories: ["酒类", "饮料"],
            purchaseFrequency: "HIGH",
            lifecycle: "ACTIVE",
            tags: ["经销商", "高价值"],
          },
        },
      },
      include: { dealer: true, addresses: true },
    });
    dealers.push(customer);
  }

  return { consumers, dealers };
}

async function seedDealerStocks(productIds: string[]) {
  const dealers = await prisma.dealer.findMany({ select: { id: true } });
  for (const dealer of dealers) {
    for (const productId of productIds.slice(0, 12)) {
      await prisma.dealerStock.create({
        data: {
          dealerId: dealer.id,
          productId,
          stock: 10 + Math.floor(Math.random() * 30),
        },
      });
    }
  }
}

async function seedSuppliersAndPurchases(productIds: string[], creatorId: string) {
  const supplier = await prisma.supplier.create({
    data: {
      name: "湖南华启供应链有限公司",
      contactName: "赵经理",
      phone: "0731-55556666",
      address: "湖南省湘潭市岳塘区产业园",
    },
  });

  const purchase = await prisma.purchaseOrder.create({
    data: {
      purchaseNo: "PO202604250001",
      supplierId: supplier.id,
      status: PurchaseStatus.SUBMITTED,
      totalAmount: "6120.00",
      createdById: creatorId,
      submittedAt: new Date(),
      remark: "Seed 示例采购单",
      items: {
        create: productIds.slice(0, 3).map((productId, index) => {
          const quantity = [10, 20, 30][index] ?? 10;
          const unitCost = ["168.00", "128.00", "62.00"][index] ?? "50.00";
          return {
            productId,
            quantity,
            unitCost,
            totalAmount: (Number(unitCost) * quantity).toFixed(2),
          };
        }),
      },
    },
  });

  return { supplier, purchase };
}

async function main() {
  await resetDatabase();

  const users = await seedUsers();
  const categories = await seedCategories();
  const brands = await seedBrands();
  const products = await seedProducts(categories, brands, users.admin.id);
  await seedCustomers(users.salesperson.id);
  await seedDealerStocks(products.map((product) => product.id));
  await seedSuppliersAndPurchases(products.map((product) => product.id), users.admin.id);

  console.log("Seed completed:");
  console.log(`- Users: admin/admin123, 13800138001/sales123, 13800138002/warehouse123, 13800138003/finance123`);
  console.log(`- Products: ${products.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
