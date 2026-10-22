"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { StockGrid, formatPower, stockKey, type StockMap } from "../products/bulk-product-form";
import type { Product, ProductSku, ProductVariant } from "@/lib/types";

interface ProductDetail {
  item: Product;
  variants: ProductVariant[];
  skus: ProductSku[];
}

export interface PickedLine {
  skuId: string;
  skuCode: string;
  label: string;
  qty: number;
  unitCost: number; // baht
  productId?: string;
  productName?: string;
  /** Color · power, without the product name. */
  detail?: string;
}

/** Label shown on a purchase line: "Mini Olivia 850 · Brown · -1.25". */
export function lineLabel(productName: string, colorName: string | undefined, power: number | undefined): string {
  return [productName, colorName, power === undefined || power === null ? undefined : formatPower(power)].filter(Boolean).join(" · ");
}

/**
 * Pick several models, then fill quantities on a color × power grid per model —
 * the same grid as opening stock on the add-product form.
 */
export function BulkLinePicker({ onAdd, showCost = true }: { onAdd: (lines: PickedLine[]) => void; showCost?: boolean }) {
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<ProductDetail[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [qty, setQty] = useState<StockMap>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const searchQuery = useQuery({
    queryKey: ["product-search-purchase", search],
    queryFn: () => apiFetch<{ items: Product[] }>("/products", { query: { q: search, active: "true" } }),
    enabled: search.trim().length > 0,
  });

  const pick = async (p: Product) => {
    setSearch("");
    if (models.some((m) => m.item._id === p._id)) return setActiveId(p._id);
    setLoading(true);
    try {
      const detail = await apiFetch<ProductDetail>(`/products/${p._id}`);
      detail.skus = detail.skus.filter((s) => s.active);
      setModels((prev) => [...prev, detail]);
      setActiveId(p._id);
    } finally {
      setLoading(false);
    }
  };

  // Grid model index = position in `models`; keys are rebuilt when a model is removed.
  const shape = (m: ProductDetail) => {
    const colorOf = new Map(m.variants.map((v) => [v._id, v.colorName ?? ""]));
    const colors = Array.from(new Set(m.skus.map((s) => (s.variantId ? colorOf.get(s.variantId) : "") ?? ""))).filter(Boolean);
    const powers = Array.from(new Set(m.skus.flatMap((s) => (s.power === undefined || s.power === null ? [] : [s.power])))).sort((a, b) => b - a);
    const skuAt = new Map(
      m.skus.map((s) => {
        const color = s.variantId ? colorOf.get(s.variantId) || null : null;
        return [stockKey(0, colors.length ? color : null, powers.length ? (s.power ?? null) : null), { sku: s, color }] as const;
      }),
    );
    const at = (c: string | null, p: number | null) => skuAt.get(stockKey(0, c, p));
    return { colors, powers, at };
  };

  const collect = (): PickedLine[] =>
    models.flatMap((m, i) => {
      const { at } = shape(m);
      const cost = costs[m.item._id];
      return Object.entries(qty).flatMap(([key, v]) => {
        const [idx, color, power] = key.split("|");
        const n = Number(v) || 0;
        if (Number(idx) !== i || n <= 0) return [];
        const hit = at(color || null, power === "" ? null : Number(power));
        if (!hit) return [];
        return [
          {
            skuId: hit.sku._id,
            skuCode: hit.sku.skuCode,
            label: lineLabel(m.item.name, hit.color ?? undefined, hit.sku.power),
            qty: n,
            unitCost: cost !== undefined && cost !== "" ? Number(cost) || 0 : (hit.sku.cost ?? m.item.defaultCost ?? 0) / 100,
            productId: m.item._id,
            productName: m.item.name,
            detail: lineLabel("", hit.color ?? undefined, hit.sku.power),
          },
        ];
      });
    });

  const picked = collect();
  const pickedQty = picked.reduce((s, l) => s + l.qty, 0);

  const remove = (id: string) => {
    const i = models.findIndex((m) => m.item._id === id);
    // Shift grid keys of later models down by one so they stay attached to the right model.
    const next: StockMap = {};
    for (const [key, v] of Object.entries(qty)) {
      const [idx, ...rest] = key.split("|");
      const n = Number(idx);
      if (n === i) continue;
      next[[n > i ? n - 1 : n, ...rest].join("|")] = v;
    }
    setQty(next);
    setModels((prev) => prev.filter((m) => m.item._id !== id));
    if (activeId === id) setActiveId(models.find((m) => m.item._id !== id)?.item._id ?? null);
  };

  const activeIndex = models.findIndex((m) => m.item._id === activeId);
  const active = models[activeIndex];
  const activeShape = active ? shape(active) : null;

  return (
    <div className="rounded-lg border border-zinc-100 p-3">
      <div className="relative">
        <input className="input" placeholder="ค้นหารุ่นสินค้า เช่น Mini Olivia — เลือกได้หลายรุ่น" value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && searchQuery.data && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
            {searchQuery.data.items.length === 0 && <p className="p-3 text-sm text-zinc-400">ไม่พบสินค้า</p>}
            {searchQuery.data.items.map((p) => (
              <button key={p._id} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => pick(p)}>
                <span>{p.name}</span>
                <span className="font-mono text-xs text-zinc-400">{p.shortCode}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="mt-3 text-xs text-zinc-400">กำลังโหลด...</p>}
      {models.length === 0 && !loading && <p className="mt-3 text-sm text-zinc-400">เลือกรุ่นแล้วใส่จำนวนแยกตามสี × ค่าสายตา</p>}

      {models.length > 0 && (
        <div className="tabs mt-3 flex-wrap">
          {models.map((m, i) => {
            const n = Object.entries(qty).reduce((s, [k, v]) => s + (k.startsWith(`${i}|`) ? Number(v) || 0 : 0), 0);
            return (
              <span key={m.item._id} className={`tab ${m.item._id === activeId ? "tab-active" : ""}`}>
                <button type="button" onClick={() => setActiveId(m.item._id)}>
                  {m.item.name}
                  {n > 0 && <span className="ml-1 text-xs text-primary-700">({n})</span>}
                </button>
                <button type="button" className="ml-2 text-zinc-300 hover:text-red-500" title="เอารุ่นนี้ออก" onClick={() => remove(m.item._id)}>
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {active && activeShape && (
        <div className="mt-3">
          {showCost && (
          <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
            <span>ทุน/หน่วย (บาท)</span>
            <input
              className="input input-sm w-24"
              type="number"
              placeholder={String((active.item.defaultCost ?? 0) / 100)}
              value={costs[active.item._id] ?? ""}
              onChange={(e) => setCosts((c) => ({ ...c, [active.item._id]: e.target.value }))}
            />
            <span className="text-zinc-400">เว้นว่าง = ทุนเดิมของแต่ละ SKU</span>
          </div>
          )}
          {active.skus.length === 0 ? (
            <p className="text-sm text-zinc-400">รุ่นนี้ยังไม่มี SKU</p>
          ) : (
            <StockGrid
              model={activeIndex}
              colors={activeShape.colors}
              powers={activeShape.powers}
              value={qty}
              onChange={setQty}
              available={(c, p) => Boolean(activeShape.at(c, p))}
            />
          )}
        </div>
      )}

      {models.length > 0 && (
        <div className="mt-3 flex items-center justify-end gap-3">
          <span className="text-xs text-zinc-500">
            {picked.length} SKU · {pickedQty} ชิ้น
          </span>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={picked.length === 0}
            onClick={() => {
              onAdd(picked);
              setQty({});
              setCosts({});
              setModels([]);
              setActiveId(null);
            }}
          >
            เพิ่มลงรายการ
          </button>
        </div>
      )}
    </div>
  );
}
