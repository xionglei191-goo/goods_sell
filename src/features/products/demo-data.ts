import type { ProductStatus } from "@prisma/client";

export type CategoryOption = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

export type BrandOption = {
  id: string;
  name: string;
  description: string | null;
};

export type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  categoryId: string;
  category: string;
  brandId: string;
  brand: string;
  retailPrice: number;
  stock: number;
  status: ProductStatus;
  bulkThreshold: number;
};

export const demoCategories: CategoryOption[] = [
  { id: "wine", name: "酒类", parentId: null, sortOrder: 1 },
  { id: "food", name: "食品", parentId: null, sortOrder: 2 },
  { id: "drink", name: "饮料", parentId: null, sortOrder: 3 },
  { id: "baijiu", name: "白酒", parentId: "wine", sortOrder: 1 },
  { id: "beer", name: "啤酒", parentId: "wine", sortOrder: 2 },
  { id: "red-wine", name: "红酒", parentId: "wine", sortOrder: 3 },
  { id: "jiangxiang", name: "酱香型", parentId: "baijiu", sortOrder: 1 },
  { id: "nongxiang", name: "浓香型", parentId: "baijiu", sortOrder: 2 },
  { id: "snack", name: "休闲食品", parentId: "food", sortOrder: 1 },
  { id: "soda", name: "碳酸饮料", parentId: "drink", sortOrder: 1 },
  { id: "juice", name: "果汁饮料", parentId: "drink", sortOrder: 2 },
];

export const demoBrands: BrandOption[] = [
  { id: "maotai", name: "茅台", description: "酱香白酒代表品牌" },
  { id: "wuliangye", name: "五粮液", description: "浓香白酒代表品牌" },
  { id: "tsingtao", name: "青岛啤酒", description: "经典啤酒品牌" },
  { id: "coca-cola", name: "可口可乐", description: "全球饮料品牌" },
  { id: "nongfu", name: "农夫山泉", description: "饮用水和饮料品牌" },
];

export const demoProducts: ProductListItem[] = [
  {
    id: "demo-1",
    sku: "HQ-BJ-001",
    name: "茅台王子酒 酱香型 500ml",
    imageUrl: "/images/products/HQ-BJ-001.png",
    categoryId: "jiangxiang",
    category: "酱香型",
    brandId: "maotai",
    brand: "茅台",
    retailPrice: 238,
    stock: 120,
    status: "ACTIVE",
    bulkThreshold: 6,
  },
  {
    id: "demo-2",
    sku: "HQ-BJ-002",
    name: "五粮液特曲 浓香型 500ml",
    imageUrl: "/images/products/HQ-BJ-002.png",
    categoryId: "nongxiang",
    category: "浓香型",
    brandId: "wuliangye",
    brand: "五粮液",
    retailPrice: 198,
    stock: 18,
    status: "ACTIVE",
    bulkThreshold: 8,
  },
  {
    id: "demo-3",
    sku: "HQ-BEER-001",
    name: "青岛经典啤酒 500ml*12",
    imageUrl: "/images/products/HQ-BEER-001.png",
    categoryId: "beer",
    category: "啤酒",
    brandId: "tsingtao",
    brand: "青岛啤酒",
    retailPrice: 72,
    stock: 240,
    status: "ACTIVE",
    bulkThreshold: 20,
  },
  {
    id: "demo-4",
    sku: "HQ-SODA-001",
    name: "可口可乐 330ml*24",
    imageUrl: "/images/products/HQ-SODA-001.png",
    categoryId: "soda",
    category: "碳酸饮料",
    brandId: "coca-cola",
    brand: "可口可乐",
    retailPrice: 68,
    stock: 320,
    status: "ACTIVE",
    bulkThreshold: 30,
  },
];
