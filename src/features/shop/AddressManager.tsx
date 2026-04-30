"use client";

import { Edit2, MapPin, Plus, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteAddress, saveAddress, setDefaultAddress } from "@/features/shop/actions";
import type { AddressInput } from "@/features/shop/schemas";
import type { AddressView } from "@/features/shop/types";

type AddressManagerProps = {
  initialAddresses: AddressView[];
};

const districts = ["雨湖区", "岳塘区", "湘潭县", "湘乡市", "韶山市"];
const emptyInput: AddressInput = { name: "", phone: "", district: "雨湖区", detail: "", isDefault: false };

export function AddressManager({ initialAddresses }: AddressManagerProps) {
  const router = useRouter();
  const [addresses, setAddresses] = useState(initialAddresses);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [input, setInput] = useState<AddressInput>(emptyInput);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEditing = isCreating || editingId !== null || input.name || input.phone || input.detail;

  useEffect(() => {
    setAddresses(initialAddresses);
  }, [initialAddresses]);

  function startCreate() {
    setEditingId(null);
    setIsCreating(true);
    setInput({ ...emptyInput, isDefault: addresses.length === 0 });
  }

  function startEdit(address: AddressView) {
    setEditingId(address.id);
    setIsCreating(false);
    setInput({
      name: address.name,
      phone: address.phone,
      district: address.district,
      detail: address.detail,
      isDefault: address.isDefault,
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await saveAddress(input, editingId ?? undefined);
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }

      setMessage(result.message ?? "地址已保存");
      setEditingId(null);
      setIsCreating(false);
      setInput(emptyInput);
      router.refresh();
    });
  }

  function makeDefault(addressId: string) {
    setAddresses((current) => current.map((address) => ({ ...address, isDefault: address.id === addressId })));
    startTransition(async () => {
      const result = await setDefaultAddress(addressId);
      if (!result.success) setMessage(result.error.message);
      router.refresh();
    });
  }

  function remove(addressId: string) {
    setAddresses((current) => current.filter((address) => address.id !== addressId));
    startTransition(async () => {
      const result = await deleteAddress(addressId);
      if (!result.success) {
        setMessage(result.error.message);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-950">地址管理</h1>
          <p className="mt-1 text-sm text-stone-500">配送范围限制为湖南省湘潭市</p>
        </div>
        <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c]" onClick={startCreate}>
          <Plus className="h-4 w-4" />
          新增地址
        </Button>
      </div>

      {message ? <p className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-600">{message}</p> : null}

      {isEditing ? (
        <section className="grid gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:grid-cols-2">
          <input className="h-10 rounded-md border border-stone-200 px-3 outline-none focus:border-red-300" onChange={(event) => setInput((current) => ({ ...current, name: event.target.value }))} placeholder="收货人" value={input.name} />
          <input className="h-10 rounded-md border border-stone-200 px-3 outline-none focus:border-red-300" onChange={(event) => setInput((current) => ({ ...current, phone: event.target.value }))} placeholder="联系电话" value={input.phone} />
          <select className="h-10 rounded-md border border-stone-200 px-3 outline-none focus:border-red-300" onChange={(event) => setInput((current) => ({ ...current, district: event.target.value }))} value={input.district}>
            {districts.map((district) => (
              <option key={district} value={district}>
                湘潭市 {district}
              </option>
            ))}
          </select>
          <input className="h-10 rounded-md border border-stone-200 px-3 outline-none focus:border-red-300" onChange={(event) => setInput((current) => ({ ...current, detail: event.target.value }))} placeholder="详细地址" value={input.detail} />
          <label className="flex items-center gap-2 text-sm text-stone-600 sm:col-span-2">
            <input checked={input.isDefault} className="h-4 w-4 accent-[#dc2626]" onChange={(event) => setInput((current) => ({ ...current, isDefault: event.target.checked }))} type="checkbox" />
            设为默认地址
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button className="bg-[#dc2626] text-white hover:bg-[#b91c1c]" disabled={isPending} onClick={submit} type="button">
              保存
            </Button>
            <Button onClick={() => { setEditingId(null); setIsCreating(false); setInput(emptyInput); }} type="button" variant="outline">
              取消
            </Button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {addresses.map((address) => (
          <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-stone-200" key={address.id}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-[#dc2626]">
                <MapPin className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-950">
                  {address.name} {address.phone}
                  {address.isDefault ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs text-[#dc2626]">默认</span> : null}
                </p>
                <p className="mt-1 text-sm text-stone-600">{address.province}{address.city}{address.district}{address.detail}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!address.isDefault ? (
                <Button onClick={() => makeDefault(address.id)} size="sm" variant="outline">
                  <Star className="h-4 w-4" />
                  设默认
                </Button>
              ) : null}
              <Button onClick={() => startEdit(address)} size="sm" variant="outline">
                <Edit2 className="h-4 w-4" />
                编辑
              </Button>
              <Button onClick={() => remove(address.id)} size="sm" variant="outline">
                <Trash2 className="h-4 w-4" />
                删除
              </Button>
            </div>
          </article>
        ))}
      </div>

      {addresses.length === 0 ? <div className="rounded-lg bg-white px-4 py-12 text-center text-sm text-stone-500 shadow-sm ring-1 ring-stone-200">暂无地址，请新增湘潭市收货地址。</div> : null}
    </div>
  );
}
