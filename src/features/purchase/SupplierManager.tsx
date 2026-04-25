"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createSupplier, deleteSupplier, updateSupplier } from "@/features/purchase/actions";
import type { SupplierItem } from "@/features/purchase/queries";

type SupplierManagerProps = {
  suppliers: SupplierItem[];
};

export function SupplierManager({ suppliers }: SupplierManagerProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addSupplier() {
    setMessage(null);
    startTransition(async () => {
      const result = await createSupplier({ name, contactName, phone, address });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      setName("");
      setContactName("");
      setPhone("");
      setAddress("");
      router.refresh();
    });
  }

  function editSupplier(supplier: SupplierItem) {
    const nextName = window.prompt("供应商名称", supplier.name);
    if (!nextName) return;
    const nextContact = window.prompt("联系人", supplier.contactName ?? "") ?? supplier.contactName ?? "";
    const nextPhone = window.prompt("联系电话", supplier.phone ?? "") ?? supplier.phone ?? "";
    const nextAddress = window.prompt("地址", supplier.address ?? "") ?? supplier.address ?? "";

    setMessage(null);
    startTransition(async () => {
      const result = await updateSupplier(supplier.id, {
        name: nextName,
        contactName: nextContact,
        phone: nextPhone,
        address: nextAddress,
      });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function removeSupplier(id: string) {
    if (!window.confirm("确认删除该供应商？有关联采购单时会被阻止。")) return;

    setMessage(null);
    startTransition(async () => {
      const result = await deleteSupplier(id);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">新增供应商</h2>
        <div className="mt-5 space-y-4">
          <input className="form-input" onChange={(event) => setName(event.target.value)} placeholder="供应商名称" value={name} />
          <input className="form-input" onChange={(event) => setContactName(event.target.value)} placeholder="联系人" value={contactName} />
          <input className="form-input" onChange={(event) => setPhone(event.target.value)} placeholder="联系电话" value={phone} />
          <input className="form-input" onChange={(event) => setAddress(event.target.value)} placeholder="地址" value={address} />
          {message ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}
          <Button disabled={isPending || !name} onClick={addSupplier} type="button">
            保存供应商
          </Button>
        </div>
      </section>

      <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">供应商列表</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-3 font-medium">供应商</th>
                <th className="py-3 font-medium">联系人</th>
                <th className="py-3 font-medium">电话</th>
                <th className="py-3 font-medium">地址</th>
                <th className="py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr className="border-b border-slate-100 last:border-0" key={supplier.id}>
                  <td className="py-3 font-medium text-slate-900">{supplier.name}</td>
                  <td className="py-3 text-slate-600">{supplier.contactName ?? "-"}</td>
                  <td className="py-3 text-slate-600">{supplier.phone ?? "-"}</td>
                  <td className="py-3 text-slate-600">{supplier.address ?? "-"}</td>
                  <td className="py-3">
                    <div className="flex justify-end gap-1">
                      <Button className="h-8 w-8" onClick={() => editSupplier(supplier)} size="icon" variant="ghost">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => removeSupplier(supplier.id)} size="icon" variant="ghost">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
