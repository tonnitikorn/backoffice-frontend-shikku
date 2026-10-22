"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { bahtToSatang, formatMoney } from "@/lib/format";
import { ActiveBadge, ConfirmDialog, EmptyRow, Field, Modal, PageHeader, Tabs, TextField, errorMessage } from "@/components/ui";
import type { Brand, Category, Product, ProductSku } from "@/lib/types";
import { AddColorsModal, BulkProductModal, PowersInput } from "./bulk-product-form";
import { ImportProductsModal } from "./import-products";
import { ProductImages } from "./product-images";

const UNITS = [
  { value: "piece", label: "ชิ้น" },
  { value: "box", label: "กล่อง" },
  { value: "bottle", label: "ขวด" },
  { value: "pair", label: "คู่" },
  { value: "set", label: "ชุด" },
];

interface Variant {
  _id: string;
  colorName?: string;
  colorCode?: string;
  images?: string[];
  active: boolean;
}

type TabKey = "products" | "brands" | "categories";

export default function ProductsPage() {
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const [tab, setTab] = useState<TabKey>("products");

  return (
    <>
      <PageHeader
        title="สินค้า"
        description="สินค้า SKU แบรนด์ และหมวดหมู่"
        actions={
          isAdmin && (
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { key: "products", label: "สินค้า" },
                { key: "brands", label: "แบรนด์" },
                { key: "categories", label: "หมวดหมู่" },
              ]}
            />
          )
        }
      />
      {tab === "products" && <ProductsPanel />}
      {tab === "brands" && <BrandsPanel />}
      {tab === "categories" && <CategoriesPanel />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

function refName(ref: Brand | Category | string | undefined): string | undefined {
  return typeof ref === "object" && ref ? ref.name : undefined;
}
function refId(ref: Brand | Category | string | undefined): string {
  return typeof ref === "object" && ref ? ref._id : (ref ?? "");
}

function ProductsPanel() {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["products", search],
    queryFn: () => apiFetch<{ items: Product[] }>("/products", { query: { q: search } }),
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input className="input max-w-sm" placeholder="ค้นหาชื่อสินค้า / รุ่น" value={search} onChange={(e) => setSearch(e.target.value)} />
        {isAdmin && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setImporting(true)}>
              นำเข้าจาก Excel
            </button>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + เพิ่มสินค้า (หลายรุ่น/สี)
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-1">
          {productsQuery.data?.items.length === 0 && <p className="p-6 text-center text-sm text-zinc-400">ยังไม่มีสินค้า</p>}
          {productsQuery.data?.items.map((p) => (
            <button
              key={p._id}
              onClick={() => setSelected(p._id)}
              className={`block w-full border-b border-zinc-100 px-4 py-3 text-left last:border-0 ${
                selected === p._id ? "bg-primary-50" : "hover:bg-zinc-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm font-medium ${p.active ? "text-zinc-800" : "text-zinc-400 line-through"}`}>{p.name}</p>
                {!p.active && <span className="badge-muted">ปิด</span>}
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">
                {p.shortCode} · {p.type === "contact_lens" ? "คอนแทคเลนส์" : "สินค้าทั่วไป"}
                {refName(p.brandId) ? ` · ${refName(p.brandId)}` : ""}
              </p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <ProductDetail
              key={selected}
              productId={selected}
              onChanged={() => qc.invalidateQueries({ queryKey: ["products"] })}
              onDeleted={() => {
                setSelected(null);
                qc.invalidateQueries({ queryKey: ["products"] });
              }}
            />
          ) : (
            <div className="card flex h-48 items-center justify-center text-sm text-zinc-400">เลือกสินค้าเพื่อดูรายละเอียดและ SKU</div>
          )}
        </div>
      </div>

      {importing && <ImportProductsModal onClose={() => setImporting(false)} onImported={() => qc.invalidateQueries({ queryKey: ["products"] })} />}
      {creating && (
        <BulkProductModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            if (id) setSelected(id);
            qc.invalidateQueries({ queryKey: ["products"] });
          }}
        />
      )}
    </>
  );
}

function ProductDetail({ productId, onChanged, onDeleted }: { productId: string; onChanged: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const [modal, setModal] = useState<"edit" | "delete" | "generate" | "sku" | "variant" | null>(null);
  const [editingSku, setEditingSku] = useState<ProductSku | null>(null);
  const [deletingSku, setDeletingSku] = useState<ProductSku | null>(null);
  const [deletingVariant, setDeletingVariant] = useState<Variant | null>(null);
  const [colorFilter, setColorFilter] = useState("");

  const detail = useQuery({
    queryKey: ["product", productId],
    queryFn: () => apiFetch<{ item: Product; variants: Variant[]; skus: ProductSku[] }>(`/products/${productId}`),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["product", productId] });
    onChanged();
  };

  const toggleMutation = useMutation({
    mutationFn: (active: boolean) => apiFetch(`/products/${productId}`, { method: "PATCH", body: { active } }),
    onSuccess: refresh,
  });
  const toggleSkuMutation = useMutation({
    mutationFn: (sku: ProductSku) => apiFetch(`/products/skus/${sku._id}`, { method: "PATCH", body: { active: !sku.active } }),
    onSuccess: refresh,
  });

  if (detail.isLoading || !detail.data) return <div className="card p-6 text-sm text-zinc-400">กำลังโหลด...</div>;
  const { item, variants, skus: allSkus } = detail.data;
  const variantName = (id?: string) => variants.find((v) => v._id === id)?.colorName;
  const variantOrder = (id?: string) => variants.findIndex((v) => v._id === id);
  const skus = allSkus
    .filter((s) => !colorFilter || s.variantId === colorFilter)
    .sort((a, b) => variantOrder(a.variantId) - variantOrder(b.variantId) || (b.power ?? 0) - (a.power ?? 0));

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-900">{item.name}</h2>
            <ActiveBadge active={item.active} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {[
              item.shortCode,
              refName(item.brandId),
              refName(item.categoryId),
              item.seriesName,
              item.dia ? `DIA ${item.dia}` : null,
              item.bc ? `BC ${item.bc}` : null,
              item.wearDurationDays ? `ใส่ได้ ${item.wearDurationDays} วัน` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {item.type === "contact_lens" && item.defaultPowerPriceRegular != null
              ? `ราคา 0.00 ฿${formatMoney(item.defaultPriceRegular)} · ค่าสายตา ฿${formatMoney(item.defaultPowerPriceRegular)}`
              : `ราคาเริ่มต้น ฿${formatMoney(item.defaultPriceRegular)}`}
            {item.defaultCost !== undefined && ` · ต้นทุนเริ่มต้น ฿${formatMoney(item.defaultCost)}`}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setModal("edit")}>
              แก้ไข
            </button>
            <button className="btn-secondary btn-sm" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(!item.active)}>
              {item.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
            </button>
            <button className="btn-ghost btn-sm text-red-500 hover:bg-red-50" onClick={() => setModal("delete")}>
              ลบ
            </button>
          </div>
        )}
      </div>

      <ProductImages productId={productId} images={item.images ?? []} variants={variants} canEdit={isAdmin} onChanged={refresh} />

      {variants.length > 0 || isAdmin ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-5 py-3">
          <span className="text-xs text-zinc-400">สี/รุ่นย่อย:</span>
          {variants.length === 0 && <span className="text-xs text-zinc-400">-</span>}
          {variants.length > 0 && (
            <button className={colorFilter === "" ? "badge-primary" : "badge-muted hover:bg-zinc-200"} onClick={() => setColorFilter("")}>
              ทั้งหมด
            </button>
          )}
          {variants.map((v) => (
            <span key={v._id} className={`${colorFilter === v._id ? "badge-primary" : "badge-muted"} gap-1.5`}>
              <button onClick={() => setColorFilter(colorFilter === v._id ? "" : v._id)}>
                {v.colorName || "(ไม่ระบุ)"}
                {v.colorCode && <span className="ml-1 font-mono text-[10px] opacity-60">{v.colorCode}</span>}
              </button>
              {isAdmin && (
                <button className="text-zinc-400 hover:text-red-500" onClick={() => setDeletingVariant(v)} aria-label="ลบ">
                  ×
                </button>
              )}
            </span>
          ))}
          {isAdmin && (
            <button className="link" onClick={() => setModal("variant")}>
              + เพิ่มสี / SKU
            </button>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <p className="text-sm font-medium text-zinc-700">
          SKU ({skus.length}
          {colorFilter ? ` จาก ${allSkus.length}` : ""})
        </p>
        {isAdmin && (
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setModal("sku")}>
              + เพิ่ม SKU
            </button>
            {item.type === "contact_lens" && (
              <button className="btn-primary btn-sm" onClick={() => setModal("generate")}>
                Generate SKU
              </button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>สี</th>
              <th>ค่าสายตา</th>
              <th className="text-right">ราคา</th>
              <th className="text-right">ต้นทุน</th>
              <th>สถานะ</th>
              {isAdmin && <th className="text-right">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {skus.length === 0 && <EmptyRow colSpan={7} text="ยังไม่มี SKU" />}
            {skus.map((sku) => (
              <tr key={sku._id}>
                <td className="font-mono text-xs text-zinc-700">{sku.skuCode}</td>
                <td className="text-zinc-500">{variantName(sku.variantId) ?? "-"}</td>
                <td className="tabular-nums">{sku.power === undefined ? "-" : sku.power.toFixed(2)}</td>
                <td className="text-right tabular-nums">฿{formatMoney(sku.priceRegular)}</td>
                <td className="text-right tabular-nums">{sku.cost !== undefined ? `฿${formatMoney(sku.cost)}` : "-"}</td>
                <td>
                  <ActiveBadge active={sku.active} />
                </td>
                {isAdmin && (
                  <td>
                    <div className="flex justify-end gap-3">
                      <button className="link" onClick={() => setEditingSku(sku)}>
                        แก้ไข
                      </button>
                      <button className="link" disabled={toggleSkuMutation.isPending} onClick={() => toggleSkuMutation.mutate(sku)}>
                        {sku.active ? "ปิด" : "เปิด"}
                      </button>
                      <button className="link-danger" onClick={() => setDeletingSku(sku)}>
                        ลบ
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === "edit" && (
        <ProductFormModal
          product={item}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {modal === "delete" && (
        <ConfirmDialog
          title="ลบสินค้า"
          message={
            <>
              ต้องการลบ <b>{item.name}</b> พร้อม SKU ทั้งหมด ({skus.length}) ใช่หรือไม่? หากมี SKU ที่เคยขาย/รับเข้า/มีสต๊อกแล้ว จะลบไม่ได้ ให้ใช้ “ปิดใช้งาน” แทน
            </>
          }
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await apiFetch(`/products/${productId}`, { method: "DELETE" });
            onDeleted();
          }}
        />
      )}
      {modal === "generate" && (
        <GenerateSkuModal
          productId={productId}
          variants={variants}
          onClose={() => setModal(null)}
          onGenerated={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {(modal === "sku" || editingSku) && (
        <SkuFormModal
          product={item}
          variants={variants}
          sku={editingSku}
          onClose={() => {
            setModal(null);
            setEditingSku(null);
          }}
          onSaved={() => {
            setModal(null);
            setEditingSku(null);
            refresh();
          }}
        />
      )}
      {modal === "variant" && (
        <AddColorsModal
          productId={productId}
          isContactLens={item.type === "contact_lens"}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refresh();
          }}
        />
      )}
      {deletingSku && (
        <ConfirmDialog
          title="ลบ SKU"
          message={
            <>
              ต้องการลบ SKU <b>{deletingSku.skuCode}</b> ใช่หรือไม่? SKU ที่มีประวัติการเคลื่อนไหวจะลบไม่ได้
            </>
          }
          onClose={() => setDeletingSku(null)}
          onConfirm={async () => {
            await apiFetch(`/products/skus/${deletingSku._id}`, { method: "DELETE" });
            refresh();
          }}
        />
      )}
      {deletingVariant && (
        <ConfirmDialog
          title="ลบสี/รุ่นย่อย"
          message={
            <>
              ต้องการลบ <b>{deletingVariant.colorName || "(ไม่ระบุ)"}</b> ใช่หรือไม่? ถ้ามี SKU ผูกอยู่จะลบไม่ได้
            </>
          }
          onClose={() => setDeletingVariant(null)}
          onConfirm={async () => {
            await apiFetch(`/products/variants/${deletingVariant._id}`, { method: "DELETE" });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ProductFormModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: (id?: string) => void }) {
  const brandsQuery = useQuery({ queryKey: ["brands"], queryFn: () => apiFetch<{ items: Brand[] }>("/brands") });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => apiFetch<{ items: Category[] }>("/categories") });

  const num = (v?: number) => (v === undefined || v === null ? "" : String(v));
  const [form, setForm] = useState({
    name: product?.name ?? "",
    shortCode: product?.shortCode ?? "",
    type: product?.type ?? ("contact_lens" as Product["type"]),
    brandId: refId(product?.brandId),
    categoryId: refId(product?.categoryId),
    seriesName: product?.seriesName ?? "",
    dia: num(product?.dia),
    bc: num(product?.bc),
    wearDurationDays: num(product?.wearDurationDays),
    unitOfMeasure: product?.unitOfMeasure ?? "piece",
    price: product ? String(product.defaultPriceRegular / 100) : "",
    powerPrice: product?.defaultPowerPriceRegular != null ? String(product.defaultPowerPriceRegular / 100) : "",
    cost: product?.defaultCost !== undefined ? String(product.defaultCost / 100) : "",
    minStock: product ? String(product.defaultMinStockLevel) : "0",
    description: product?.description ?? "",
  });
  // On by default: editing the product price should re-price every SKU unless the user opts out.
  const [applyPricesToSkus, setApplyPricesToSkus] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const optNum = (v: string) => (v.trim() === "" ? undefined : Number(v));

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: form.name,
        shortCode: form.shortCode,
        type: form.type,
        brandId: form.brandId || undefined,
        categoryId: form.categoryId || undefined,
        seriesName: form.seriesName || undefined,
        dia: optNum(form.dia),
        bc: optNum(form.bc),
        wearDurationDays: optNum(form.wearDurationDays),
        unitOfMeasure: form.unitOfMeasure,
        defaultPriceRegular: bahtToSatang(Number(form.price) || 0),
        defaultPowerPriceRegular: form.type === "contact_lens" && form.powerPrice.trim() !== "" ? bahtToSatang(Number(form.powerPrice) || 0) : null,
        ...(product && applyPricesToSkus ? { applyPricesToSkus: true } : {}),
        defaultMinStockLevel: Number(form.minStock) || 0,
        description: form.description || undefined,
      };
      if (form.cost !== "") body.defaultCost = bahtToSatang(Number(form.cost) || 0);
      return product
        ? apiFetch<{ item: Product }>(`/products/${product._id}`, { method: "PATCH", body })
        : apiFetch<{ item: Product }>("/products", { method: "POST", body });
    },
    onSuccess: (data) => onSaved(data.item?._id),
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title={product ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!form.name || !form.shortCode || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <TextField label="ชื่อสินค้า" value={form.name} onChange={set("name")} className="col-span-2" />
        <TextField label="รหัสย่อ (ใช้สร้าง SKU)" value={form.shortCode} onChange={set("shortCode")} />
        <Field label="ประเภทสินค้า">
          <select className="input" value={form.type} onChange={(e) => set("type")(e.target.value)}>
            <option value="contact_lens">คอนแทคเลนส์</option>
            <option value="other">สินค้าทั่วไป</option>
          </select>
        </Field>
        <Field label="แบรนด์">
          <select className="input" value={form.brandId} onChange={(e) => set("brandId")(e.target.value)}>
            <option value="">- ไม่ระบุ -</option>
            {brandsQuery.data?.items
              .filter((b) => b.active || b._id === form.brandId)
              .map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="หมวดหมู่">
          <select className="input" value={form.categoryId} onChange={(e) => set("categoryId")(e.target.value)}>
            <option value="">- ไม่ระบุ -</option>
            {categoriesQuery.data?.items
              .filter((c) => (c.active && c.appliesTo === form.type) || c._id === form.categoryId)
              .map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        {form.type === "contact_lens" && (
          <>
            <TextField label="รุ่น / ซีรีส์" value={form.seriesName} onChange={set("seriesName")} />
            <TextField label="DIA" type="number" value={form.dia} onChange={set("dia")} />
            <TextField label="BC" type="number" value={form.bc} onChange={set("bc")} />
            <TextField label="ระยะเวลาใส่ (วัน)" type="number" value={form.wearDurationDays} onChange={set("wearDurationDays")} />
          </>
        )}
        <Field label="หน่วยนับ">
          <select className="input" value={form.unitOfMeasure} onChange={(e) => set("unitOfMeasure")(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </Field>
        {form.type === "contact_lens" ? (
          <>
            <TextField label="ราคาขาย 0.00 / ไม่มีสายตา (บาท)" type="number" value={form.price} onChange={set("price")} />
            <TextField label="ราคาขาย ค่าสายตา (บาท)" type="number" value={form.powerPrice} onChange={set("powerPrice")} placeholder="เว้นว่าง = ราคาเดียวกัน" />
          </>
        ) : (
          <TextField label="ราคาขายเริ่มต้น (บาท)" type="number" value={form.price} onChange={set("price")} />
        )}
        <TextField label="ต้นทุนเริ่มต้น (บาท)" type="number" value={form.cost} onChange={set("cost")} />
        <TextField label="สต๊อกขั้นต่ำเริ่มต้น" type="number" value={form.minStock} onChange={set("minStock")} />
        <Field label="รายละเอียด" className="col-span-2 sm:col-span-3">
          <textarea className="input min-h-20" value={form.description} onChange={(e) => set("description")(e.target.value)} />
        </Field>
      </div>
      {product && (
        <div className="mt-4 rounded-lg bg-zinc-50 p-3">
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input type="checkbox" className="mt-0.5 accent-primary-500" checked={applyPricesToSkus} onChange={(e) => setApplyPricesToSkus(e.target.checked)} />
            <span>
              อัปเดตราคาทุก SKU ของสินค้านี้ให้ตรงกับราคาด้านบน
              <span className="block text-xs text-zinc-400">
                0.00 / ไม่มีสายตา ใช้ราคา 0.00 · ค่าสายตาอื่นใช้ราคาค่าสายตา · เอาติ๊กออกถ้าต้องการเก็บราคาเฉพาะที่ตั้งไว้ใน SKU บางตัว
              </span>
            </span>
          </label>
        </div>
      )}
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

function SkuFormModal({
  product,
  variants,
  sku,
  onClose,
  onSaved,
}: {
  product: Product;
  variants: Variant[];
  sku: ProductSku | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const baht = (v?: number) => (v === undefined || v === null ? "" : String(v / 100));
  const [form, setForm] = useState({
    skuCode: sku?.skuCode ?? "",
    barcode: sku?.barcode ?? "",
    variantId: sku?.variantId ?? "",
    power: sku?.power !== undefined ? String(sku.power) : "",
    priceRegular: sku ? baht(sku.priceRegular) : baht(product.defaultPriceRegular),
    priceMember: baht(sku?.priceMember),
    priceSpecial: baht(sku?.priceSpecial),
    cost: sku ? baht(sku.cost) : baht(product.defaultCost),
    minStockLevel: sku ? String(sku.minStockLevel) : String(product.defaultMinStockLevel ?? 0),
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const optSatang = (v: string) => (v.trim() === "" ? undefined : bahtToSatang(Number(v)));

  const mutation = useMutation({
    mutationFn: () => {
      const common = {
        power: form.power.trim() === "" ? undefined : Number(form.power),
        priceRegular: bahtToSatang(Number(form.priceRegular) || 0),
        priceMember: optSatang(form.priceMember),
        priceSpecial: optSatang(form.priceSpecial),
        cost: optSatang(form.cost),
        minStockLevel: Number(form.minStockLevel) || 0,
      };
      if (sku) {
        return apiFetch(`/products/skus/${sku._id}`, { method: "PATCH", body: { ...common, barcode: form.barcode || undefined } });
      }
      return apiFetch(`/products/${product._id}/skus`, {
        method: "POST",
        body: { ...common, cost: common.cost ?? 0, skuCode: form.skuCode, barcode: form.barcode || undefined, variantId: form.variantId || undefined },
      });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title={sku ? `แก้ไข SKU ${sku.skuCode}` : "เพิ่ม SKU"}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={(!sku && !form.skuCode) || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="รหัส SKU">
          <input className="input" value={form.skuCode} disabled={Boolean(sku)} onChange={(e) => set("skuCode")(e.target.value)} />
        </Field>
        <TextField label="Barcode (เว้นว่าง = ใช้รหัส SKU)" value={form.barcode} onChange={set("barcode")} />
        {!sku && variants.length > 0 && (
          <Field label="สี/รุ่นย่อย">
            <select className="input" value={form.variantId} onChange={(e) => set("variantId")(e.target.value)}>
              <option value="">- ไม่ระบุ -</option>
              {variants.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.colorName || "(ไม่ระบุ)"}
                </option>
              ))}
            </select>
          </Field>
        )}
        {product.type === "contact_lens" && <TextField label="ค่าสายตา" type="number" value={form.power} onChange={set("power")} />}
        <TextField label="ราคาปกติ (บาท)" type="number" value={form.priceRegular} onChange={set("priceRegular")} />
        <TextField label="ราคาสมาชิก (บาท)" type="number" value={form.priceMember} onChange={set("priceMember")} />
        <TextField label="ราคาพิเศษ (บาท)" type="number" value={form.priceSpecial} onChange={set("priceSpecial")} />
        <TextField label="ต้นทุน (บาท)" type="number" value={form.cost} onChange={set("cost")} />
        <TextField label="สต๊อกขั้นต่ำ" type="number" value={form.minStockLevel} onChange={set("minStockLevel")} />
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

interface PreviewResult {
  totalRequested: number;
  totalToCreate: number;
  totalDuplicates: number;
  exceedsCap: boolean;
}

function GenerateSkuModal({
  productId,
  variants,
  onClose,
  onGenerated,
}: {
  productId: string;
  variants: Variant[];
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [variantId, setVariantId] = useState(variants[0]?._id ?? "");
  const [powers, setPowers] = useState<number[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Each picked value is sent as a single-value range, so no step is needed.
  const body = { variantId: variantId || undefined, ranges: powers.map((p) => ({ from: p, to: p, step: 0.25 })) };

  const previewMutation = useMutation({
    mutationFn: () => apiFetch<PreviewResult>(`/products/${productId}/skus/generate/preview`, { method: "POST", body }),
    onSuccess: (data) => {
      setError(null);
      setPreview(data);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiFetch(`/products/${productId}/skus/generate`, { method: "POST", body }),
    onSuccess: onGenerated,
    onError: (err) => setError(errorMessage(err)),
  });

  const changed = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPreview(null);
  };

  return (
    <Modal
      title="เพิ่ม SKU ตามค่าสายตา"
      onClose={onClose}
      size="2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-secondary" disabled={powers.length === 0 || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
            Preview
          </button>
          <button className="btn-primary" disabled={!preview || preview.exceedsCap || generateMutation.isPending} onClick={() => generateMutation.mutate()}>
            สร้าง SKU
          </button>
        </>
      }
    >
      {variants.length > 0 && (
        <Field label="สี/รุ่นย่อย" className="mb-4">
          <select className="input" value={variantId} onChange={(e) => changed(setVariantId)(e.target.value)}>
            <option value="">- ไม่ระบุ -</option>
            {variants.map((v) => (
              <option key={v._id} value={v._id}>
                {v.colorName || "(ไม่ระบุ)"}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="ค่าสายตา">
        <PowersInput value={powers} onChange={changed(setPowers)} />
      </Field>

      {preview && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-400">ขอสร้าง</p>
            <p className="text-lg font-semibold text-zinc-800">{preview.totalRequested}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-400">ซ้ำ (ข้าม)</p>
            <p className="text-lg font-semibold text-zinc-800">{preview.totalDuplicates}</p>
          </div>
          <div className="rounded-lg bg-primary-50 p-3">
            <p className="text-xs text-primary-700">สร้างใหม่</p>
            <p className="text-lg font-semibold text-primary-800">{preview.totalToCreate}</p>
          </div>
        </div>
      )}
      {preview?.exceedsCap && <p className="error-text mt-3">เกินเพดานจำนวน SKU ต่อครั้ง</p>}
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Brands & categories                                                 */
/* ------------------------------------------------------------------ */

function BrandsPanel() {
  return (
    <SimpleRefPanel<Brand>
      endpoint="/brands"
      queryKey="brands"
      entityLabel="แบรนด์"
      columns={[{ label: "ชื่อแบรนด์", render: (b) => <span className="font-medium text-zinc-800">{b.name}</span> }]}
      renderForm={(item, onClose, onSaved) => <BrandFormModal brand={item} onClose={onClose} onSaved={onSaved} />}
    />
  );
}

function CategoriesPanel() {
  return (
    <SimpleRefPanel<Category>
      endpoint="/categories"
      queryKey="categories"
      entityLabel="หมวดหมู่"
      columns={[
        { label: "ชื่อหมวดหมู่", render: (c) => <span className="font-medium text-zinc-800">{c.name}</span> },
        { label: "ใช้กับ", render: (c) => (c.appliesTo === "contact_lens" ? "คอนแทคเลนส์" : "สินค้าทั่วไป") },
      ]}
      renderForm={(item, onClose, onSaved) => <CategoryFormModal category={item} onClose={onClose} onSaved={onSaved} />}
    />
  );
}

function SimpleRefPanel<T extends { _id: string; name: string; active: boolean }>({
  endpoint,
  queryKey,
  entityLabel,
  columns,
  renderForm,
}: {
  endpoint: string;
  queryKey: string;
  entityLabel: string;
  columns: { label: string; render: (item: T) => React.ReactNode }[];
  renderForm: (item: T | null, onClose: () => void, onSaved: () => void) => React.ReactNode;
}) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: [queryKey], queryFn: () => apiFetch<{ items: T[] }>(endpoint) });
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);

  const toggleMutation = useMutation({
    mutationFn: (item: T) => apiFetch(`${endpoint}/${item._id}`, { method: "PATCH", body: { active: !item.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
  });

  return (
    <>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + เพิ่ม{entityLabel}
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
              <th>สถานะ</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.length === 0 && <EmptyRow colSpan={columns.length + 2} />}
            {query.data?.items.map((item) => (
              <tr key={item._id}>
                {columns.map((c) => (
                  <td key={c.label}>{c.render(item)}</td>
                ))}
                <td>
                  <ActiveBadge active={item.active} />
                </td>
                <td>
                  <div className="flex justify-end gap-3">
                    <button className="link" onClick={() => setEditing(item)}>
                      แก้ไข
                    </button>
                    <button className="link" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(item)}>
                      {item.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                    <button className="link-danger" onClick={() => setDeleting(item)}>
                      ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing &&
        renderForm(
          editing === "new" ? null : editing,
          () => setEditing(null),
          () => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: [queryKey] });
            qc.invalidateQueries({ queryKey: ["products"] });
          },
        )}
      {deleting && (
        <ConfirmDialog
          title={`ลบ${entityLabel}`}
          message={
            <>
              ต้องการลบ <b>{deleting.name}</b> ใช่หรือไม่? หากมีสินค้าใช้อยู่จะลบไม่ได้ ให้ใช้ “ปิดใช้งาน” แทน
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`${endpoint}/${deleting._id}`, { method: "DELETE" });
            qc.invalidateQueries({ queryKey: [queryKey] });
          }}
        />
      )}
    </>
  );
}

function BrandFormModal({ brand, onClose, onSaved }: { brand: Brand | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(brand?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => (brand ? apiFetch(`/brands/${brand._id}`, { method: "PATCH", body: { name } }) : apiFetch("/brands", { method: "POST", body: { name } })),
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });
  return (
    <Modal
      title={brand ? "แก้ไขแบรนด์" : "เพิ่มแบรนด์"}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!name || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <TextField label="ชื่อแบรนด์" value={name} onChange={setName} />
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

function CategoryFormModal({ category, onClose, onSaved }: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [appliesTo, setAppliesTo] = useState<Category["appliesTo"]>(category?.appliesTo ?? "contact_lens");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      category
        ? apiFetch(`/categories/${category._id}`, { method: "PATCH", body: { name, appliesTo } })
        : apiFetch("/categories", { method: "POST", body: { name, appliesTo } }),
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });
  return (
    <Modal
      title={category ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!name || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="ชื่อหมวดหมู่" value={name} onChange={setName} />
        <Field label="ใช้กับสินค้าประเภท">
          <select className="input" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as Category["appliesTo"])}>
            <option value="contact_lens">คอนแทคเลนส์</option>
            <option value="other">สินค้าทั่วไป</option>
          </select>
        </Field>
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}
