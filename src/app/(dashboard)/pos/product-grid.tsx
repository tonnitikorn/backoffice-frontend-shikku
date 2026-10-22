"use client";

/* eslint-disable @next/next/no-img-element -- product photos come from the API origin, sized client-side on upload */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiClientError, assetUrl } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { formatMoney } from "@/lib/format";
import { Modal } from "@/components/ui";
import type { ProductSku } from "@/lib/types";

export interface CatalogItem {
  _id: string;
  name: string;
  type: "contact_lens" | "other";
  category: { _id: string; name: string } | null;
  image: string | null;
  priceMin: number;
  priceMax: number;
  skuCount: number;
  singleSkuId: string | null;
  qtyOnHand: number;
}

interface PosOptions {
  product: { _id: string; name: string; images: string[] };
  variants: { _id: string; colorName?: string; images: string[] }[];
  skus: (ProductSku & { qtyOnHand: number })[];
}

/** What the cart shows instead of a SKU code, e.g. "Ava · Brown · -1.00". */
export function skuLabel(productName: string, colorName: string | undefined, power: number | undefined) {
  return [productName, colorName, power === undefined || power === null ? undefined : power === 0 ? "0.00 (ปกติ)" : power.toFixed(2)].filter(Boolean).join(" · ");
}

type AddToCart = (sku: ProductSku, label: string, stock?: number) => void;

export function ProductGrid({ branchId, onAdd }: { branchId: string; onAdd: AddToCart }) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [picking, setPicking] = useState<CatalogItem | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const catalog = useQuery({
    queryKey: ["pos-catalog", branchId],
    queryFn: () => apiFetch<{ items: CatalogItem[] }>("/products/pos/catalog", { query: { branchId } }),
    staleTime: 30_000,
  });

  const items = useMemo(() => catalog.data?.items ?? [], [catalog.data]);
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) if (i.category) map.set(i.category._id, i.category.name);
    return [...map].sort((a, b) => a[1].localeCompare(b[1], "th"));
  }, [items]);

  const term = search.trim().toLowerCase();
  const visible = items.filter(
    (i) =>
      (!term || i.name.toLowerCase().includes(term)) &&
      (!categoryId || (categoryId === "none" ? !i.category : i.category?._id === categoryId)) &&
      // Searching always shows sold-out models too, so a miscounted item can still be found and sold.
      (!inStockOnly || term !== "" || i.qtyOnHand > 0),
  );

  async function addSingle(item: CatalogItem) {
    const opts = await apiFetch<PosOptions>(`/products/${item._id}/pos-options`, { query: { branchId } });
    const sku = opts.skus[0];
    if (sku) onAdd(sku, skuLabel(item.name, opts.variants.find((v) => v._id === sku.variantId)?.colorName, sku.power), sku.qtyOnHand);
  }

  /** Barcode scanners type the code then press Enter: add that exact SKU without opening the picker. */
  async function onScan() {
    const code = search.trim();
    if (!code) return;
    const res = await apiFetch<{ items: (ProductSku & { qtyOnHand: number; productId: { name: string } | string })[] }>("/products/skus/search", { query: { branchId, q: code } });
    const exact = res.items.find((s) => s.barcode === code || s.skuCode.toLowerCase() === code.toLowerCase());
    if (!exact) {
      setScanMessage(visible.length === 0 ? `ไม่พบสินค้า “${code}”` : null);
      return;
    }
    const productName = typeof exact.productId === "object" ? exact.productId.name : exact.skuCode;
    // A scanned barcode means the item is in hand, so a short system count is sold through and flagged.
    onAdd(exact, skuLabel(productName, undefined, exact.power), exact.qtyOnHand);
    setSearch("");
    setScanMessage(null);
  }

  return (
    <div className="@container flex flex-col gap-3">
      <div className="sticky top-16 z-10 -mb-1 flex flex-col gap-3 bg-zinc-50 pt-1 pb-1 sm:top-0 sm:pt-0">
        <input
          className="input py-2.5"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="ค้นหารุ่น / สแกน Barcode แล้วกด Enter"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setScanMessage(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && onScan()}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={categoryId === ""} onClick={() => setCategoryId("")}>
            ทั้งหมด
          </Chip>
          {categories.map(([id, name]) => (
            <Chip key={id} active={categoryId === id} onClick={() => setCategoryId(id)}>
              {name}
            </Chip>
          ))}
          {items.some((i) => !i.category) && (
            <Chip active={categoryId === "none"} onClick={() => setCategoryId("none")}>
              ไม่ระบุหมวด
            </Chip>
          )}
          <label className="ml-auto flex min-h-10 items-center gap-2 px-1 text-sm text-zinc-500">
            <input type="checkbox" className="h-5 w-5 accent-primary-600" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
            เฉพาะที่มีของ
          </label>
        </div>
      </div>
      {scanMessage && <p className="text-sm text-amber-600">{scanMessage}</p>}

      {catalog.isLoading && <p className="py-10 text-center text-sm text-zinc-400">กำลังโหลดสินค้า...</p>}
      {!catalog.isLoading && visible.length === 0 && <p className="py-10 text-center text-sm text-zinc-400">ไม่พบสินค้า</p>}
      {/* Columns follow the space next to the cart, not the screen width. */}
      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5">
        {visible.map((item) => (
          <button
            key={item._id}
            type="button"
            onClick={() => (item.skuCount === 1 && item.qtyOnHand > 0 ? addSingle(item) : setPicking(item))}
            className={`group flex flex-col overflow-hidden rounded-xl border bg-white text-left transition select-none hover:border-primary-300 hover:shadow-sm active:scale-[0.98] active:border-primary-400 ${
              item.qtyOnHand > 0 ? "border-zinc-200" : "border-zinc-100 opacity-60"
            }`}
          >
            <ProductImage src={item.image} name={item.name} className="aspect-[4/3]" />
            <div className="flex flex-1 flex-col gap-0.5 p-2.5">
              <span className="line-clamp-2 text-[15px] font-medium leading-snug text-zinc-900">{item.name}</span>
              <span className="text-sm font-semibold text-zinc-700">
                ฿{formatMoney(item.priceMin).replace(/\.00$/, "")}
                {item.priceMax !== item.priceMin && `–${formatMoney(item.priceMax).replace(/\.00$/, "")}`}
              </span>
              <span className={`mt-auto text-xs ${item.qtyOnHand > 0 ? "text-zinc-400" : "text-red-500"}`}>{item.qtyOnHand > 0 ? `คงเหลือ ${item.qtyOnHand}` : "หมด"}</span>
            </div>
          </button>
        ))}
      </div>

      {picking && <PowerPicker item={picking} branchId={branchId} onClose={() => setPicking(null)} onAdd={onAdd} />}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-full px-4 py-1.5 text-sm transition ${active ? "bg-primary-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
    >
      {children}
    </button>
  );
}

export function ProductImage({ src, name, className = "aspect-square" }: { src: string | null | undefined; name: string; className?: string }) {
  const url = assetUrl(src);
  if (url) return <img src={url} alt={name} loading="lazy" className={`${className} w-full bg-zinc-50 object-cover`} />;
  return (
    <div className={`${className} flex w-full items-center justify-center bg-gradient-to-br from-primary-50 to-zinc-100 text-2xl font-semibold text-primary-700/60`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

/** Tap a model → pick color → tap a power. Stays open so several powers can go into one bill. */
function PowerPicker({ item, branchId, onClose, onAdd }: { item: CatalogItem; branchId: string; onClose: () => void; onAdd: AddToCart }) {
  const query = useQuery({
    queryKey: ["pos-options", item._id, branchId],
    queryFn: () => apiFetch<PosOptions>(`/products/${item._id}/pos-options`, { query: { branchId } }),
  });
  const [variantId, setVariantId] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  const data = query.data;
  const variantsWithSkus = (data?.variants ?? []).filter((v) => data?.skus.some((s) => s.variantId === v._id));
  const hasNoVariantSkus = data?.skus.some((s) => !s.variantId);
  const selectedVariant = variantId ?? (variantsWithSkus.length === 1 && !hasNoVariantSkus ? variantsWithSkus[0]._id : null);
  const needsColor = variantsWithSkus.length > 1 || (variantsWithSkus.length > 0 && hasNoVariantSkus);
  const skus = (data?.skus ?? []).filter((s) => (needsColor ? (selectedVariant ? s.variantId === selectedVariant : false) : true));
  const variant = data?.variants.find((v) => v._id === selectedVariant);
  const heroImage = variant?.images[0] ?? data?.product.images[0] ?? item.image;
  const [addedCounts, setAddedCounts] = useState<Record<string, number>>({});
  const [confirming, setConfirming] = useState<(ProductSku & { qtyOnHand: number }) | null>(null);
  const role = useAuthStore((s) => s.user?.role);
  const canAdjust = role === "admin" || role === "branch_manager";
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjusting, setAdjusting] = useState<(ProductSku & { qtyOnHand: number }) | null>(null);

  // One price for every power → show it once in the header instead of on each button.
  const prices = new Set(skus.map((s) => s.priceRegular));
  const uniformPrice = prices.size === 1 ? skus[0].priceRegular : null;
  const powerGroups = [
    { label: "สายตาสั้น (−)", skus: skus.filter((s) => s.power != null && s.power < 0) },
    { label: "ไม่มีค่าสายตา", skus: skus.filter((s) => s.power === 0) },
    { label: "สายตายาว (+)", skus: skus.filter((s) => s.power != null && s.power > 0) },
    { label: "อื่น ๆ", skus: skus.filter((s) => s.power == null) },
  ].filter((g) => g.skus.length > 0);

  function add(sku: ProductSku & { qtyOnHand: number }, confirmed = false) {
    if (adjustMode) {
      setAdjusting(sku);
      return;
    }
    // System says none left (counting what was already added here): make the cashier confirm it's really on hand.
    if (!confirmed && (addedCounts[sku._id] ?? 0) >= sku.qtyOnHand) {
      setConfirming(sku);
      return;
    }
    setConfirming(null);
    const label = skuLabel(item.name, data?.variants.find((v) => v._id === sku.variantId)?.colorName, sku.power);
    onAdd(sku, label, sku.qtyOnHand);
    setAdded((prev) => [label, ...prev].slice(0, 4));
    setAddedCounts((prev) => ({ ...prev, [sku._id]: (prev[sku._id] ?? 0) + 1 }));
  }

  return (
    <Modal
      title={item.name}
      size="xl"
      onClose={onClose}
      footer={
        <button className="btn-primary" onClick={onClose}>
          เสร็จ
        </button>
      }
    >
      {query.isLoading && <p className="text-sm text-zinc-400">กำลังโหลด...</p>}
      {data && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="w-full shrink-0 overflow-hidden rounded-xl sm:w-44">
            <ProductImage src={heroImage} name={item.name} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {needsColor && (
              <div>
                <p className="label">เลือกสี</p>
                <div className="flex flex-wrap gap-2">
                  {variantsWithSkus.map((v) => {
                    const qty = data.skus.filter((s) => s.variantId === v._id).reduce((sum, s) => sum + s.qtyOnHand, 0);
                    return (
                      <button
                        key={v._id}
                        type="button"
                        onClick={() => setVariantId(v._id)}
                        className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
                          selectedVariant === v._id ? "border-primary-500 bg-primary-50 text-primary-800" : "border-zinc-200 hover:bg-zinc-50"
                        } ${qty === 0 ? "opacity-50" : ""}`}
                      >
                        {v.images[0] && <img src={assetUrl(v.images[0])} alt="" className="h-7 w-7 rounded-md object-cover" />}
                        {v.colorName || "(ไม่ระบุ)"}
                        <span className="text-xs text-zinc-400">{qty}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {(!needsColor || selectedVariant) && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <p className="label mb-0">{adjustMode ? "แตะค่าที่ต้องการปรับสต๊อก" : item.type === "contact_lens" ? "เลือกค่าสายตา" : "เลือกสินค้า"}</p>
                  <div className="flex items-center gap-3">
                    {uniformPrice !== null && (
                      <p className="text-sm text-zinc-500">
                        ราคา <span className="text-base font-semibold text-zinc-900">฿{formatPrice(uniformPrice)}</span> / ชิ้น
                      </p>
                    )}
                    {canAdjust && (
                      <button
                        type="button"
                        className={adjustMode ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                        onClick={() => {
                          setAdjustMode((v) => !v);
                          setAdjusting(null);
                          setConfirming(null);
                        }}
                      >
                        {adjustMode ? "เสร็จการปรับสต๊อก" : "ปรับสต๊อก"}
                      </button>
                    )}
                  </div>
                </div>
                {adjustMode && !adjusting && (
                  <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">โหมดปรับสต๊อก: แตะค่าสายตาเพื่อแก้จำนวนให้ตรงกับของจริง (ระหว่างนี้แตะแล้วจะไม่ลงตะกร้า)</p>
                )}
                {adjusting && (
                  <StockAdjustPanel
                    key={adjusting._id}
                    sku={adjusting}
                    branchId={branchId}
                    label={adjusting.power == null ? adjusting.skuCode : formatPower(adjusting.power)}
                    onDone={() => setAdjusting(null)}
                  />
                )}
                {confirming && (
                  <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <p>
                      ระบบแสดงว่า <b>{confirming.power == null ? confirming.skuCode : formatPower(confirming.power)}</b> เหลือ{" "}
                      {Math.max(confirming.qtyOnHand - (addedCounts[confirming._id] ?? 0), 0)} — มีของอยู่จริงใช่ไหม?
                      <br />
                      <span className="text-xs text-amber-700">ขายได้เลย ระบบจะบันทึกเป็น “ขายเกินสต๊อก” ไว้ในสรุปกะให้ผู้จัดการตรวจนับและปรับสต๊อก</span>
                    </p>
                    <div className="flex gap-2">
                      <button type="button" className="btn-primary btn-sm" onClick={() => add(confirming, true)}>
                        มีของจริง ขายได้
                      </button>
                      {canAdjust && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            setAdjusting(confirming);
                            setConfirming(null);
                          }}
                        >
                          ปรับสต๊อกให้ตรงก่อน
                        </button>
                      )}
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirming(null)}>
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                )}
                {powerGroups.map((group) => (
                  <div key={group.label}>
                    {powerGroups.length > 1 && <p className="mb-1.5 text-xs font-medium text-zinc-500">{group.label}</p>}
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                      {group.skus.map((s) => (
                        <PowerButton
                          key={s._id}
                          sku={s}
                          showPrice={uniformPrice === null}
                          addedCount={adjustMode ? 0 : (addedCounts[s._id] ?? 0)}
                          selected={adjusting?._id === s._id}
                          onClick={() => add(s)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {added.length > 0 && <p className="text-xs text-primary-700">เพิ่มลงตะกร้าแล้ว: {added.join(", ")}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function formatPrice(satang: number) {
  return formatMoney(satang).replace(/\.00$/, "");
}

function formatPower(power: number) {
  return power === 0 ? "0.00" : power > 0 ? `+${power.toFixed(2)}` : power.toFixed(2);
}

/** Power on top, price (only when it varies) in the middle, stock as a separate badge at the bottom. Sold-out stays tappable (asks to confirm). */
function PowerButton({
  sku,
  showPrice,
  addedCount,
  selected,
  onClick,
}: {
  sku: ProductSku & { qtyOnHand: number };
  showPrice: boolean;
  addedCount: number;
  selected: boolean;
  onClick: () => void;
}) {
  const qty = sku.qtyOnHand;
  const out = qty <= 0;
  const stockClass = out ? "bg-red-50 text-red-600" : qty <= 2 ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 tabular-nums transition hover:border-primary-400 hover:bg-primary-50 active:scale-[0.97] ${
        selected
          ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200"
          : addedCount > 0
            ? "border-primary-400 bg-primary-50/50"
            : out
              ? "border-dashed border-zinc-300 bg-zinc-50"
              : "border-zinc-200 bg-white"
      }`}
    >
      {addedCount > 0 && (
        <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1 text-[11px] font-semibold text-white">
          {addedCount}
        </span>
      )}
      <span className={`text-lg leading-none font-semibold ${out ? "text-zinc-500" : "text-zinc-900"}`}>{sku.power == null ? sku.skuCode : formatPower(sku.power)}</span>
      {showPrice && <span className="text-xs font-medium text-zinc-700">฿{formatPrice(sku.priceRegular)}</span>}
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stockClass}`}>{out ? "หมด" : `เหลือ ${qty}`}</span>
    </button>
  );
}

const ADJUST_REASONS = ["นับจริงไม่ตรงระบบ", "พบของเพิ่ม", "ของหาย/ชำรุด"];

/** Manager-only: set the system count to what is physically on the shelf, without leaving the POS. */
function StockAdjustPanel({ sku, branchId, label, onDone }: { sku: ProductSku & { qtyOnHand: number }; branchId: string; label: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(String(Math.max(sku.qtyOnHand, 0)));
  const [reason, setReason] = useState(ADJUST_REASONS[0]);
  const newQty = Number(qty);
  const valid = qty !== "" && Number.isInteger(newQty) && newQty >= 0 && newQty !== sku.qtyOnHand && reason.trim() !== "";

  const mutation = useMutation({
    mutationFn: () => apiFetch("/stock/adjust", { method: "POST", body: { branchId, skuId: sku._id, newQty, reason: `${reason.trim()} (POS)` } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-options"] });
      qc.invalidateQueries({ queryKey: ["pos-catalog", branchId] });
      onDone();
    },
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm">
      <p className="font-medium text-sky-900">
        ปรับสต๊อก <span className="tabular-nums">{label}</span>
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-xs text-zinc-500">ในระบบ</p>
          <p className="text-lg font-semibold tabular-nums text-zinc-500">{sku.qtyOnHand}</p>
        </div>
        <span className="pb-1 text-zinc-400">→</span>
        <div>
          <p className="text-xs text-zinc-500">นับได้จริง</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="h-9 w-9 rounded-md border border-zinc-300 bg-white"
              onClick={() => setQty(String(Math.max((Number(qty) || 0) - 1, 0)))}
              aria-label="ลด"
            >
              −
            </button>
            <input
              className="input h-9 w-16 text-center text-lg font-semibold tabular-nums"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
            <button type="button" className="h-9 w-9 rounded-md border border-zinc-300 bg-white" onClick={() => setQty(String((Number(qty) || 0) + 1))} aria-label="เพิ่ม">
              +
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ADJUST_REASONS.map((r) => (
          <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
            {r}
          </Chip>
        ))}
      </div>
      {mutation.isError && <p className="text-xs text-red-600">{mutation.error instanceof ApiClientError ? mutation.error.message : "เกิดข้อผิดพลาด"}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary btn-sm" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
          บันทึกจำนวนใหม่
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={onDone}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
