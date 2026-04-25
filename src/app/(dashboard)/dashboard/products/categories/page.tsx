import { CategoryManager } from "@/features/products/CategoryManager";
import { getCategories } from "@/features/products/queries";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await getCategories();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">分类管理</h1>
        <p className="mt-1 text-sm text-slate-500">维护三级分类树，有子分类或关联产品时禁止删除</p>
      </div>
      <CategoryManager categories={categories} />
    </div>
  );
}
