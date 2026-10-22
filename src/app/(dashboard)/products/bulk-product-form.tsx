"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { bahtToSatang } from "@/lib/format";
import { useEffectiveBranchId } from "@/lib/useEffectiveBranch";
import { Field, Modal, TextField, errorMessage } from "@/components/ui";
import type { Branch, Brand, Category } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Colors                                                              */
/* ------------------------------------------------------------------ */

export interface ColorRow {
  name: string;
  code: string; // empty = let the server derive it
}

const COLOR_PRESETS = ["Brown", "Light Brown", "Gray", "Green", "Black", "Blue", "Choco", "Pink", "Violet", "Hazel"];

/** Mirrors the server's deriveColorCode so the user sees the code before saving. */
export function suggestColorCode(name: string): string {
  const words = name.trim().toUpperCase().split(/\s+/).map((w) => w.replace(/[^A-Z0-9]/g, "")).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3);
  return words.map((w) => w[0]).join("").slice(0, 4);
}

export function ColorsInput({ value, onChange }: { value: ColorRow[]; onChange: (v: ColorRow[]) => void }) {
  const [draft, setDraft] = useState("");
  const has = (name: string) => value.some((c) => c.name.toLowerCase() === name.trim().toLowerCase());

  const add = (raw: string) => {
    // Accept "Brown, Gray, Light Brown" in one go.
    const names = raw
      .split(/[,\n]/)
      .map((n) => n.trim())
      .filter((n) => n && !has(n));
    if (names.length) onChange([...value, ...names.map((name) => ({ name, code: "" }))]);
    setDraft("");
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="พิมพ์ชื่อสีแล้วกด Enter (ใส่หลายสีคั่นด้วย , ได้)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <button type="button" className="btn-secondary" disabled={!draft.trim()} onClick={() => add(draft)}>
          เพิ่ม
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {COLOR_PRESETS.filter((p) => !has(p)).map((p) => (
          <button key={p} type="button" className="rounded-md border border-dashed border-zinc-200 px-2 py-0.5 text-xs text-zinc-400 hover:border-primary-300 hover:text-primary-700" onClick={() => add(p)}>
            + {p}
          </button>
        ))}
      </div>
      {value.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {value.map((c, i) => (
            <div key={c.name} className="flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 py-1 pr-1.5 pl-2.5 text-sm text-primary-900">
              <span>{c.name}</span>
              <input
                className="w-14 rounded border border-primary-200 bg-white px-1 py-0.5 text-center font-mono text-[11px] uppercase text-zinc-600 focus:border-primary-400 focus:outline-none"
                value={c.code}
                placeholder={suggestColorCode(c.name) || "รหัส"}
                title="รหัสสีที่ใช้ใน SKU (เว้นว่าง = สร้างให้อัตโนมัติ)"
                maxLength={6}
                onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") } : x)))}
              />
              <button type="button" className="px-0.5 text-primary-700/60 hover:text-red-500" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`ลบ ${c.name}`}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function colorsToBody(colors: ColorRow[]) {
  return colors.map((c) => ({ name: c.name, code: c.code || undefined }));
}

/* ------------------------------------------------------------------ */
/* Powers — pick the exact values, no ranges/steps                     */
/* ------------------------------------------------------------------ */

const r2 = (n: number) => Math.round(n * 100) / 100;
// The shop sells minus powers only, and -0.25 isn't stocked: 0.00, -0.50 … -6.00, -6.50 … -10.00.
const POWER_OPTIONS = [
  0,
  ...Array.from({ length: 23 }, (_, i) => r2(-0.5 - i * 0.25)), // -0.50 … -6.00
  ...Array.from({ length: 8 }, (_, i) => r2(-6.5 - i * 0.5)), // -6.50 … -10.00
];

export function formatPower(p: number): string {
  return p === 0 ? "0.00" : p.toFixed(2);
}

export function PowersInput({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [custom, setCustom] = useState("");
  const selected = new Set(value);
  const sorted = (list: number[]) => Array.from(new Set(list)).sort((a, b) => b - a);
  const toggle = (p: number) => onChange(sorted(selected.has(p) ? value.filter((x) => x !== p) : [...value, p]));
  const addCustom = () => {
    const nums = custom
      .split(/[,\s]+/)
      .map((t) => Number(t))
      .filter((n) => Number.isFinite(n) && n <= 0 && n >= -30)
      .map(r2);
    if (nums.length) onChange(sorted([...value, ...nums]));
    setCustom("");
  };
  const extra = value.filter((p) => !POWER_OPTIONS.includes(p));

  const chip = (p: number) => (
    <button
      key={p}
      type="button"
      onClick={() => toggle(p)}
      className={`rounded-md border px-1.5 py-1 font-mono text-xs tabular-nums transition-colors ${
        selected.has(p) ? "border-primary-400 bg-primary-400 text-primary-900" : "border-zinc-200 text-zinc-500 hover:border-primary-300"
      }`}
    >
      {formatPower(p)}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-zinc-500">
          เลือกแล้ว <b className="text-zinc-800">{value.length}</b> ค่า
        </span>
        <button type="button" className="link" onClick={() => onChange(sorted([...value, ...POWER_OPTIONS.filter((p) => p >= -6)]))}>
          เลือก 0.00 ถึง -6.00
        </button>
        <button type="button" className="link" onClick={() => onChange(sorted([...value, ...POWER_OPTIONS]))}>
          เลือกทั้งหมด (ถึง -10.00)
        </button>
        {value.length > 0 && (
          <button type="button" className="link-danger" onClick={() => onChange([])}>
            ล้าง
          </button>
        )}
      </div>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-9 lg:grid-cols-11">
        {POWER_OPTIONS.map(chip)}
        {extra.map(chip)}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="input input-sm max-w-xs"
          placeholder="ค่าอื่นๆ เช่น -11.00, -12.00"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <button type="button" className="btn-secondary btn-sm" disabled={!custom.trim()} onClick={addCustom}>
          เพิ่มค่า
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Opening stock grid: power (rows) × color (columns)                   */
/* ------------------------------------------------------------------ */

export type StockMap = Record<string, string>;
export const stockKey = (model: number, color: string | null, power: number | null) =>
  `${model}|${(color ?? "").toLowerCase()}|${power === null ? "" : power.toFixed(2)}`;

export function StockGrid({
  model,
  colors,
  powers,
  value,
  onChange,
  available,
}: {
  model: number;
  colors: string[];
  powers: number[];
  value: StockMap;
  onChange: (v: StockMap) => void;
  /** Cells that return false have no SKU and are shown locked. */
  available?: (color: string | null, power: number | null) => boolean;
}) {
  const [fillAll, setFillAll] = useState("");
  const cols: (string | null)[] = colors.length > 0 ? colors : [null];
  const rows: (number | null)[] = powers.length > 0 ? powers : [null];
  const qty = (c: string | null, p: number | null) => Number(value[stockKey(model, c, p)] || 0);
  const set = (c: string | null, p: number | null, v: string) => onChange({ ...value, [stockKey(model, c, p)]: v.replace(/[^\d]/g, "") });
  const colTotal = (c: string | null) => rows.reduce<number>((sum, p) => sum + qty(c, p), 0);
  const grand = cols.reduce<number>((sum, c) => sum + colTotal(c), 0);

  const applyAll = () => {
    const next = { ...value };
    for (const c of cols) for (const p of rows) if (!available || available(c, p)) next[stockKey(model, c, p)] = fillAll;
    onChange(next);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
        <span>ใส่เท่ากันทุกช่อง</span>
        <input className="input input-sm w-16" inputMode="numeric" value={fillAll} onChange={(e) => setFillAll(e.target.value.replace(/[^\d]/g, ""))} />
        <button type="button" className="btn-secondary btn-sm" disabled={fillAll === ""} onClick={applyAll}>
          ใส่
        </button>
        <span className="ml-auto">
          รวม <b className="text-zinc-800 tabular-nums">{grand}</b> ชิ้น
        </span>
      </div>
      <div className="max-h-80 overflow-auto rounded-lg border border-zinc-100">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-zinc-100">
              <th className="sticky left-0 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-400">{powers.length > 0 ? "ค่าสายตา" : ""}</th>
              {cols.map((c) => (
                <th key={c ?? "-"} className="px-1 py-2 text-center text-xs font-medium whitespace-nowrap text-zinc-500">
                  {c ?? "จำนวน"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p ?? "-"} className="border-b border-zinc-50 last:border-0">
                <td className="sticky left-0 bg-white px-3 py-1 font-mono text-xs text-zinc-600 tabular-nums">{p === null ? "-" : formatPower(p)}</td>
                {cols.map((c) => (
                  <td key={c ?? "-"} className="px-1 py-1">
                    {available && !available(c, p) ? (
                      <span className="block text-center text-xs text-zinc-300">–</span>
                    ) : (
                      <input
                        className="w-full min-w-14 rounded-md border border-zinc-200 px-1.5 py-1 text-center text-sm tabular-nums placeholder:text-zinc-300 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
                        inputMode="numeric"
                        placeholder="0"
                        value={value[stockKey(model, c, p)] ?? ""}
                        onChange={(e) => set(c, p, e.target.value)}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot className="sticky bottom-0 bg-zinc-50">
              <tr>
                <td className="sticky left-0 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-400">รวม</td>
                {cols.map((c) => (
                  <td key={c ?? "-"} className="px-1 py-1.5 text-center text-xs font-medium text-zinc-600 tabular-nums">
                    {colTotal(c)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function stockToBody(stock: StockMap, modelIndexMap: Map<number, number>) {
  return Object.entries(stock)
    .map(([key, v]) => {
      const [m, color, power] = key.split("|");
      return { model: modelIndexMap.get(Number(m)), color: color || null, power: power === "" ? null : Number(power), qty: Number(v) || 0 };
    })
    .filter((e): e is { model: number; color: string | null; power: number | null; qty: number } => e.model !== undefined && e.qty > 0);
}

/** Stock keys store lowercased color names; send them back with the casing the user typed. */
function restoreColorCase(entries: ReturnType<typeof stockToBody>, colors: ColorRow[]) {
  return entries.map((e) => ({ ...e, color: e.color === null ? null : (colors.find((c) => c.name.toLowerCase() === e.color)?.name ?? e.color) }));
}

function BranchPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiFetch<{ items: Branch[] }>("/branches") });
  return (
    <select className="input input-sm w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">เลือกสาขา</option>
      {branchesQuery.data?.items
        .filter((b) => b.active)
        .map((b) => (
          <option key={b._id} value={b._id}>
            {b.name}
          </option>
        ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk create modal                                                    */
/* ------------------------------------------------------------------ */

interface ModelRow {
  id: number; // stable id so stock quantities survive removing another row
  name: string;
  shortCode: string;
  seriesName: string;
  codeTouched: boolean;
}

/** "Mini Olivia 850" -> "MO850": initials of words + any numbers. */
function suggestShortCode(name: string): string {
  const words = name.trim().toUpperCase().split(/\s+/).filter(Boolean);
  return words
    .map((w) => (/^\d+$/.test(w) ? w : w.replace(/[^A-Z0-9]/g, "").charAt(0)))
    .join("")
    .slice(0, 10);
}

interface BulkPreview {
  productCount: number;
  totalSkus: number;
  duplicates: string[];
  cap: number;
  exceedsCap: boolean;
  sample: string[];
}

const UNITS = [
  { value: "pair", label: "คู่" },
  { value: "piece", label: "ชิ้น" },
  { value: "box", label: "กล่อง" },
  { value: "bottle", label: "ขวด" },
  { value: "set", label: "ชุด" },
];

let nextModelId = 1;
const newModel = (): ModelRow => ({ id: nextModelId++, name: "", shortCode: "", seriesName: "", codeTouched: false });

export function BulkProductModal({ onClose, onCreated }: { onClose: () => void; onCreated: (firstProductId?: string) => void }) {
  const brandsQuery = useQuery({ queryKey: ["brands"], queryFn: () => apiFetch<{ items: Brand[] }>("/brands") });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => apiFetch<{ items: Category[] }>("/categories") });
  const effectiveBranchId = useEffectiveBranchId();

  const [models, setModels] = useState<ModelRow[]>(() => [newModel()]);
  const [type, setType] = useState<"contact_lens" | "other">("contact_lens");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("pair");
  const [price, setPrice] = useState("");
  const [powerPrice, setPowerPrice] = useState("");
  const [cost, setCost] = useState("");
  const [minStock, setMinStock] = useState("0");
  const [dia, setDia] = useState("");
  const [bc, setBc] = useState("");
  const [wearDays, setWearDays] = useState("");
  const [colors, setColors] = useState<ColorRow[]>([]);
  const [powers, setPowers] = useState<number[]>([]);
  const [branchId, setBranchId] = useState(effectiveBranchId ?? "");
  const [stock, setStock] = useState<StockMap>({});
  const [stockModelId, setStockModelId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ key: string; data: BulkPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validModels = models.filter((m) => m.name.trim() && m.shortCode.trim());
  const usePowers = type === "contact_lens" ? powers : [];
  const optNum = (v: string) => (v.trim() === "" ? undefined : Number(v));
  // Stock keys use the row's stable id; the server wants the index among submitted models.
  const modelIndexMap = new Map(validModels.map((m, i) => [m.id, i]));
  const stockEntries = restoreColorCase(stockToBody(stock, modelIndexMap), colors);
  const stockTotal = stockEntries.reduce((s, e) => s + e.qty, 0);

  const body = {
    models: validModels.map((m) => ({ name: m.name.trim(), shortCode: m.shortCode.trim(), seriesName: m.seriesName.trim() || undefined })),
    common: {
      type,
      brandId: brandId || undefined,
      categoryId: categoryId || undefined,
      unitOfMeasure,
      defaultPriceRegular: bahtToSatang(Number(price) || 0),
      defaultPowerPriceRegular: type === "contact_lens" && powerPrice.trim() !== "" ? bahtToSatang(Number(powerPrice) || 0) : undefined,
      defaultCost: bahtToSatang(Number(cost) || 0),
      defaultMinStockLevel: Number(minStock) || 0,
      dia: type === "contact_lens" ? optNum(dia) : undefined,
      bc: type === "contact_lens" ? optNum(bc) : undefined,
      wearDurationDays: type === "contact_lens" ? optNum(wearDays) : undefined,
    },
    colors: colorsToBody(colors),
    powers: usePowers,
    branchId: stockTotal > 0 ? branchId || undefined : undefined,
    stock: stockEntries,
  };
  // Preview only depends on what SKUs will exist, not on quantities.
  const previewKey = JSON.stringify({ models: body.models, common: body.common, colors: body.colors, powers: body.powers });
  const currentPreview = preview?.key === previewKey ? preview.data : null;

  const expected = validModels.length * Math.max(colors.length, 1) * Math.max(usePowers.length, 1);

  const previewMutation = useMutation({
    mutationFn: () => apiFetch<BulkPreview>("/products/bulk/preview", { method: "POST", body }),
    onSuccess: (data) => {
      setError(null);
      setPreview({ key: previewKey, data });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const createMutation = useMutation({
    mutationFn: () => apiFetch<{ items: { _id: string }[]; skuCount: number }>("/products/bulk", { method: "POST", body }),
    onSuccess: (data) => onCreated(data.items[0]?._id),
    onError: (err) => setError(errorMessage(err)),
  });

  const updateModel = (id: number, patch: Partial<ModelRow>) =>
    setModels((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...patch };
        if (patch.name !== undefined && !m.codeTouched) next.shortCode = suggestShortCode(patch.name);
        return next;
      }),
    );

  const activeStockModel = validModels.find((m) => m.id === stockModelId) ?? validModels[0];
  const needsBranch = stockTotal > 0 && !branchId;
  const canPreview = validModels.length > 0;
  const canCreate = Boolean(currentPreview && !currentPreview.exceedsCap && currentPreview.duplicates.length === 0 && !needsBranch);

  return (
    <Modal
      title="เพิ่มสินค้า (หลายรุ่น / หลายสี / หลายค่าสายตา)"
      onClose={onClose}
      size="2xl"
      footer={
        <>
          <p className="mr-auto self-center text-xs text-zinc-400">
            {validModels.length} รุ่น × {Math.max(colors.length, 1)} สี × {Math.max(usePowers.length, 1)} ค่าสายตา ={" "}
            <span className="font-semibold text-zinc-700">{expected} SKU</span>
            {stockTotal > 0 && <> · สต๊อก {stockTotal} ชิ้น</>}
          </p>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          {canCreate ? (
            <button className="btn-primary" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "กำลังสร้าง..." : `สร้าง ${currentPreview!.totalSkus} SKU`}
            </button>
          ) : (
            <button className="btn-primary" disabled={!canPreview || needsBranch || previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              ตรวจสอบก่อนสร้าง
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-6 pb-2">
        {/* 1. Models */}
        <Section step={1} title="รุ่นสินค้า" hint="ใส่ได้หลายรุ่นที่ใช้สี/ค่าสายตา/ราคาเดียวกัน">
          <div className="overflow-hidden rounded-lg border border-zinc-100">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ชื่อรุ่น</th>
                  <th className="w-36">รหัสย่อ (ใช้ใน SKU)</th>
                  <th className="w-40">ซีรีส์</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2">
                      <input className="input input-sm" placeholder="เช่น Mini Olivia 850" value={m.name} onChange={(e) => updateModel(m.id, { name: e.target.value })} />
                    </td>
                    <td className="py-2">
                      <input
                        className="input input-sm font-mono uppercase"
                        value={m.shortCode}
                        onChange={(e) => updateModel(m.id, { shortCode: e.target.value.toUpperCase(), codeTouched: true })}
                      />
                    </td>
                    <td className="py-2">
                      <input className="input input-sm" value={m.seriesName} onChange={(e) => updateModel(m.id, { seriesName: e.target.value })} />
                    </td>
                    <td className="py-2">
                      {models.length > 1 && (
                        <button className="link-danger" onClick={() => setModels((prev) => prev.filter((x) => x.id !== m.id))}>
                          ลบ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="link mt-2" onClick={() => setModels((prev) => [...prev, newModel()])}>
            + เพิ่มรุ่น
          </button>
        </Section>

        {/* 2. Shared details */}
        <Section step={2} title="ข้อมูลร่วมของทุกรุ่น">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="ประเภท">
              <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="contact_lens">คอนแทคเลนส์</option>
                <option value="other">สินค้าทั่วไป</option>
              </select>
            </Field>
            <Field label="แบรนด์">
              <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">- ไม่ระบุ -</option>
                {brandsQuery.data?.items
                  .filter((b) => b.active)
                  .map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="หมวดหมู่">
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">- ไม่ระบุ -</option>
                {categoriesQuery.data?.items
                  .filter((c) => c.active && c.appliesTo === type)
                  .map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="หน่วยนับ">
              <select className="input" value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)}>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
            {type === "contact_lens" ? (
              <>
                <TextField label="ราคาขาย 0.00 / ไม่มีสายตา (บาท)" type="number" value={price} onChange={setPrice} placeholder="109" />
                <TextField label="ราคาขาย ค่าสายตา (บาท)" type="number" value={powerPrice} onChange={setPowerPrice} placeholder={price ? `เท่ากับ ${price}` : "เว้นว่าง = ราคาเดียวกัน"} />
              </>
            ) : (
              <TextField label="ราคาขาย (บาท)" type="number" value={price} onChange={setPrice} placeholder="109" />
            )}
            <TextField label="ต้นทุน (บาท)" type="number" value={cost} onChange={setCost} />
            <TextField label="สต๊อกขั้นต่ำ" type="number" value={minStock} onChange={setMinStock} />
            {type === "contact_lens" && <TextField label="ระยะใส่ (วัน)" type="number" value={wearDays} onChange={setWearDays} />}
            {type === "contact_lens" && (
              <>
                <TextField label="DIA" type="number" value={dia} onChange={setDia} />
                <TextField label="BC" type="number" value={bc} onChange={setBc} />
              </>
            )}
          </div>
        </Section>

        {/* 3. Colors */}
        <Section step={3} title="สี" hint="ทุกรุ่นจะได้สีชุดเดียวกัน · ไม่ใส่สี = ไม่แยกสี">
          <ColorsInput value={colors} onChange={setColors} />
        </Section>

        {/* 4. Powers */}
        {type === "contact_lens" && (
          <Section step={4} title="ค่าสายตา" hint="กดเลือกค่าที่มีขาย · ไม่เลือก = ไม่มีค่าสายตา (เลนส์แฟชั่น)">
            <PowersInput value={powers} onChange={setPowers} />
          </Section>
        )}

        {/* 5. Opening stock */}
        <Section step={type === "contact_lens" ? 5 : 4} title="จำนวนสต๊อกตั้งต้น" hint="ไม่บังคับ · เว้นว่าง = 0 · รับของเข้าทีหลังได้ที่หน้ารับสินค้า">
          {validModels.length === 0 ? (
            <p className="text-sm text-zinc-400">ใส่ชื่อรุ่นก่อน แล้วตารางจำนวนจะแสดงที่นี่</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="text-xs text-zinc-500">บันทึกเข้าสาขา</span>
                <BranchPicker value={branchId} onChange={setBranchId} />
                {needsBranch && <span className="text-xs text-red-500">เลือกสาขาก่อน</span>}
              </div>
              {validModels.length > 1 && (
                <div className="tabs mb-3">
                  {validModels.map((m) => (
                    <button key={m.id} type="button" className={`tab ${activeStockModel?.id === m.id ? "tab-active" : ""}`} onClick={() => setStockModelId(m.id)}>
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
              {activeStockModel && (
                <StockGrid model={activeStockModel.id} colors={colors.map((c) => c.name)} powers={usePowers} value={stock} onChange={setStock} />
              )}
            </>
          )}
        </Section>

        {currentPreview && (
          <div className={`rounded-xl p-4 text-sm ${currentPreview.duplicates.length || currentPreview.exceedsCap ? "bg-red-50" : "bg-primary-50"}`}>
            <p className="font-medium text-zinc-800">
              พร้อมสร้าง {currentPreview.productCount} รุ่น รวม {currentPreview.totalSkus} SKU{stockTotal > 0 && ` · สต๊อกตั้งต้น ${stockTotal} ชิ้น`}
            </p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              ตัวอย่าง: {currentPreview.sample.slice(0, 6).join(", ")}
              {currentPreview.totalSkus > 6 ? " …" : ""}
            </p>
            {currentPreview.duplicates.length > 0 && (
              <p className="mt-2 text-red-600">
                รหัส SKU ซ้ำกับที่มีอยู่ {currentPreview.duplicates.length} รายการ (เช่น {currentPreview.duplicates.slice(0, 3).join(", ")}) — เปลี่ยนรหัสย่อหรือรหัสสี
              </p>
            )}
            {currentPreview.exceedsCap && <p className="mt-2 text-red-600">เกินเพดาน {currentPreview.cap} SKU ต่อครั้ง — แบ่งสร้างหลายรอบ หรือปรับในตั้งค่าระบบ</p>}
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Add colors to an existing product                                    */
/* ------------------------------------------------------------------ */

export function AddColorsModal({
  productId,
  isContactLens,
  onClose,
  onSaved,
}: {
  productId: string;
  isContactLens: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const effectiveBranchId = useEffectiveBranchId();
  const [colors, setColors] = useState<ColorRow[]>([]);
  const [powers, setPowers] = useState<number[]>([]);
  const [branchId, setBranchId] = useState(effectiveBranchId ?? "");
  const [stock, setStock] = useState<StockMap>({});
  const [error, setError] = useState<string | null>(null);

  const usePowers = isContactLens ? powers : [];
  const total = colors.length * Math.max(usePowers.length, 1);
  const stockEntries = restoreColorCase(stockToBody(stock, new Map([[0, 0]])), colors);
  const stockTotal = stockEntries.reduce((s, e) => s + e.qty, 0);
  const needsBranch = stockTotal > 0 && !branchId;

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch(`/products/${productId}/colors`, {
        method: "POST",
        body: { colors: colorsToBody(colors), powers: usePowers, branchId: stockTotal > 0 ? branchId : undefined, stock: stockEntries },
      }),
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title="เพิ่มสี (พร้อมสร้าง SKU)"
      onClose={onClose}
      size="2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={colors.length === 0 || needsBranch || mutation.isPending} onClick={() => mutation.mutate()}>
            เพิ่ม {colors.length} สี · {total} SKU{stockTotal > 0 && ` · ${stockTotal} ชิ้น`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <Field label="สี">
          <ColorsInput value={colors} onChange={setColors} />
        </Field>
        {isContactLens && (
          <Field label="ค่าสายตา (ไม่เลือก = ไม่มีค่าสายตา)">
            <PowersInput value={powers} onChange={setPowers} />
          </Field>
        )}
        {colors.length > 0 && (
          <Field label="จำนวนสต๊อกตั้งต้น (ไม่บังคับ)">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-xs text-zinc-500">บันทึกเข้าสาขา</span>
              <BranchPicker value={branchId} onChange={setBranchId} />
              {needsBranch && <span className="text-xs text-red-500">เลือกสาขาก่อน</span>}
            </div>
            <StockGrid model={0} colors={colors.map((c) => c.name)} powers={usePowers} value={stock} onChange={setStock} />
          </Field>
        )}
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[11px] font-semibold text-primary-800">{step}</span>
        <h4 className="text-sm font-semibold text-zinc-800">{title}</h4>
        {hint && <p className="text-xs text-zinc-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
