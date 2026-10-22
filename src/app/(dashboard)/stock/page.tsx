"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { useEffectiveBranchId } from "@/lib/useEffectiveBranch";
import { formatDateTime } from "@/lib/format";
import { EmptyRow, Field, Modal, Notice, PageHeader, Tabs, TextField, errorMessage } from "@/components/ui";
import type { Product, ProductSku } from "@/lib/types";
import { BulkLinePicker, lineLabel, type PickedLine } from "../purchases/bulk-lines";
import { PhotoFill, type PhotoLine } from "./photo-fill";

interface InventoryRow {
  _id: string;
  branchId: string;
  skuId: (Omit<ProductSku, "variantId"> & { variantId?: string | { _id: string; colorName?: string } | null }) | null;
  qtyOnHand: number;
  onlineReservedQty?: number;
}

interface LedgerRow {
  _id: string;
  type: string;
  qtyChange: number;
  balanceAfter: number;
  reason?: string;
  createdAt: string;
  skuId: ProductSku | null;
  performedBy: { name: string } | null;
}

const TXN_LABEL: Record<string, string> = {
  purchase_in: "รับสินค้าเข้า",
  sale_out: "ขาย",
  return_in: "รับคืน",
  write_off: "ตัดจำหน่าย",
  adjustment_increase: "ปรับเพิ่ม",
  adjustment_decrease: "ปรับลด",
  damage_out: "เสียหาย",
  internal_use_out: "ใช้ภายใน",
  transfer_out: "โอนออก",
  transfer_in: "โอนเข้า",
  reversal: "กลับรายการ",
};

type TabKey = "current" | "ledger" | "alerts";
type StockFilter = "all" | "out" | "low";

function matchesFilter(row: InventoryRow, filter: StockFilter) {
  if (filter === "out") return row.qtyOnHand <= 0;
  if (filter === "low") return row.qtyOnHand <= 2;
  return true;
}

export default function StockPage() {
  const branchId = useEffectiveBranchId();
  const role = useAuthStore((s) => s.user?.role);
  const canAdjust = role === "admin" || role === "branch_manager";
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("current");
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<{ sku: ProductSku; qty: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");

  const currentQuery = useQuery({
    queryKey: ["inventory-current", branchId],
    queryFn: () => apiFetch<{ items: InventoryRow[] }>("/stock/current", { query: { branchId } }),
    enabled: Boolean(branchId),
  });

  const ledgerQuery = useQuery({
    queryKey: ["inventory-ledger", branchId],
    queryFn: () => apiFetch<{ items: LedgerRow[] }>("/stock/ledger", { query: { branchId } }),
    enabled: Boolean(branchId) && tab === "ledger",
  });

  const alertsQuery = useQuery({
    queryKey: ["low-stock", branchId],
    queryFn: () =>
      apiFetch<{ items: { branchId: string; sku: ProductSku; qtyOnHand: number; threshold: number }[] }>("/products/low-stock", {
        query: { branchId },
      }),
    enabled: Boolean(branchId) && tab === "alerts",
  });

  if (!branchId) return <Notice>กรุณาเลือกสาขาจากแถบด้านบน</Notice>;

  const term = search.trim().toLowerCase();
  const items = currentQuery.data?.items ?? [];
  const outTotal = items.filter((r) => r.skuId && r.qtyOnHand <= 0).length;
  const groups = groupByModel(items.filter((r) => matchesFilter(r, stockFilter)), term);
  const allOpen = groups.length > 0 && groups.every((g) => expanded[g.productId]);

  return (
    <>
      <PageHeader
        title="สต๊อก"
        description="ยอดคงเหลือ ประวัติเคลื่อนไหว และสินค้าใกล้หมด"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {canAdjust && (
              <button className="btn-primary" onClick={() => setAdding(true)}>
                + เติมสต๊อก
              </button>
            )}
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { key: "current", label: "คงเหลือ" },
                { key: "ledger", label: "ประวัติเคลื่อนไหว" },
                { key: "alerts", label: "สต๊อกต่ำ" },
              ]}
            />
          </div>
        }
      />

      {tab === "current" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input min-w-0 basis-full py-2.5 sm:max-w-sm sm:flex-1 sm:basis-auto"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="ค้นหาชื่อรุ่น / SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="tabs">
              {(
                [
                  ["all", "ทั้งหมด"],
                  ["out", `หมด${outTotal ? ` (${outTotal})` : ""}`],
                  ["low", "ใกล้หมด (≤2)"],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" className={`tab ${stockFilter === key ? "tab-active" : ""}`} onClick={() => setStockFilter(key)}>
                  {label}
                </button>
              ))}
            </div>
            {stockFilter === "all" && groups.length > 0 && (
              <button className="btn-ghost ml-auto" onClick={() => setExpanded(allOpen ? {} : Object.fromEntries(groups.map((g) => [g.productId, true])))}>
                {allOpen ? "ย่อทั้งหมด" : "ขยายทั้งหมด"}
              </button>
            )}
          </div>
          {currentQuery.data && (
            <p className="-mt-2 text-sm text-zinc-500">
              {groups.length} รุ่น · รวม <span className="font-semibold text-zinc-800">{groups.reduce((s, g) => s + g.total, 0)}</span> ชิ้น
              {canAdjust && <span className="text-zinc-400"> · แตะค่าสายตาเพื่อปรับสต๊อก</span>}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {currentQuery.isLoading && <p className="py-10 text-center text-sm text-zinc-400">กำลังโหลด...</p>}
            {currentQuery.data && groups.length === 0 && (
              <p className="card py-10 text-center text-sm text-zinc-400">{stockFilter === "all" ? "ไม่มีสต๊อกในสาขานี้" : "ไม่มีรายการที่ตรงเงื่อนไข"}</p>
            )}
            {groups.map((g) => {
              // Filters and SKU-code searches open the model so the matching SKUs are visible.
              const open = expanded[g.productId] ?? (g.matchedBySku || stockFilter !== "all");
              const toggle = () => setExpanded((e) => ({ ...e, [g.productId]: !open }));
              const reserved = g.rows.reduce((sum, r) => sum + (r.onlineReservedQty || 0), 0);
              const outCount = g.rows.filter((r) => r.qtyOnHand <= 0).length;
              return (
                <div key={g.productId} className="card overflow-hidden">
                  <button type="button" className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50" onClick={toggle} aria-expanded={open}>
                    <span className={`text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-zinc-900">{g.productName}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                        <span>{g.rows.length} รายการ</span>
                        {outCount > 0 && <span className="badge-danger">หมด {outCount}</span>}
                        {reserved > 0 && <span className="badge-muted">กันไว้ Online {reserved}</span>}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`block text-xl font-semibold tabular-nums ${g.total <= 0 ? "text-red-500" : "text-zinc-900"}`}>{g.total}</span>
                      <span className="text-[11px] text-zinc-400">ชิ้น</span>
                    </span>
                  </button>
                  {open && (
                    <div className="flex flex-col gap-3 border-t border-zinc-100 bg-zinc-50/60 p-3">
                      {byColor(g.rows).map(([color, rows]) => (
                        <div key={color || "-"}>
                          {color && <p className="mb-1.5 text-xs font-medium text-zinc-500">{color}</p>}
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                            {rows.map((row) => (
                              <StockTile
                                key={row._id}
                                row={row}
                                onClick={canAdjust ? () => setAdjusting({ sku: row.skuId as ProductSku, qty: row.qtyOnHand }) : undefined}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "ledger" && (
        <div className="flex flex-col gap-2 sm:hidden">
          {ledgerQuery.data?.items.length === 0 && <p className="card py-10 text-center text-sm text-zinc-400">ยังไม่มีข้อมูล</p>}
          {ledgerQuery.data?.items.map((row) => (
            <div key={row._id} className="card flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="badge-muted">{TXN_LABEL[row.type] ?? row.type}</span>
                  <span className="truncate text-sm text-zinc-800">{row.skuId ? lineLabel(productName(row.skuId), undefined, row.skuId.power) || row.skuId.skuCode : "-"}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  {formatDateTime(row.createdAt)} · {row.performedBy?.name ?? "-"}
                </p>
                {row.reason && <p className="mt-0.5 text-xs text-zinc-500">{row.reason}</p>}
              </div>
              <div className="text-right">
                <p className={`text-lg font-semibold tabular-nums ${row.qtyChange > 0 ? "text-primary-700" : "text-red-500"}`}>
                  {row.qtyChange > 0 ? `+${row.qtyChange}` : row.qtyChange}
                </p>
                <p className="text-[11px] text-zinc-400">เหลือ {row.balanceAfter}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "ledger" && (
        <div className="table-wrap hidden sm:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>SKU</th>
                <th>ประเภท</th>
                <th className="text-right">จำนวน</th>
                <th className="text-right">คงเหลือหลังรายการ</th>
                <th>เหตุผล</th>
                <th>ผู้ทำรายการ</th>
              </tr>
            </thead>
            <tbody>
              {ledgerQuery.data?.items.length === 0 && <EmptyRow colSpan={7} />}
              {ledgerQuery.data?.items.map((row) => (
                <tr key={row._id}>
                  <td className="whitespace-nowrap text-xs">{formatDateTime(row.createdAt)}</td>
                  <td className="font-mono text-xs">{row.skuId?.skuCode ?? "-"}</td>
                  <td>
                    <span className="badge-muted">{TXN_LABEL[row.type] ?? row.type}</span>
                  </td>
                  <td className={`text-right tabular-nums ${row.qtyChange > 0 ? "text-primary-700" : "text-red-500"}`}>
                    {row.qtyChange > 0 ? `+${row.qtyChange}` : row.qtyChange}
                  </td>
                  <td className="text-right tabular-nums">{row.balanceAfter}</td>
                  <td className="max-w-48 truncate text-xs text-zinc-500">{row.reason || "-"}</td>
                  <td className="text-xs">{row.performedBy?.name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "alerts" && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th className="text-right">คงเหลือ</th>
                <th className="text-right">จุดสั่งซื้อขั้นต่ำ</th>
              </tr>
            </thead>
            <tbody>
              {alertsQuery.data?.items.length === 0 && <EmptyRow colSpan={3} text="ไม่มีสินค้าที่ต่ำกว่าจุดสั่งซื้อ" />}
              {alertsQuery.data?.items.map((row) => (
                <tr key={row.sku._id}>
                  <td className="font-mono text-xs">{row.sku.skuCode}</td>
                  <td className="text-right font-medium tabular-nums text-red-500">{row.qtyOnHand}</td>
                  <td className="text-right tabular-nums">{row.threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddStockModal
          branchId={branchId}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            qc.invalidateQueries({ queryKey: ["inventory-current", branchId] });
            qc.invalidateQueries({ queryKey: ["inventory-ledger", branchId] });
            qc.invalidateQueries({ queryKey: ["low-stock", branchId] });
          }}
        />
      )}

      {adjusting && (
        <AdjustStockModal
          branchId={branchId}
          sku={adjusting.sku}
          currentQty={adjusting.qty}
          onClose={() => setAdjusting(null)}
          onDone={() => {
            setAdjusting(null);
            qc.invalidateQueries({ queryKey: ["inventory-current", branchId] });
            qc.invalidateQueries({ queryKey: ["inventory-ledger", branchId] });
          }}
        />
      )}
    </>
  );
}

function byColor(rows: InventoryRow[]): [string, InventoryRow[]][] {
  const map = new Map<string, InventoryRow[]>();
  for (const r of rows) {
    const c = colorOf(r.skuId!);
    map.set(c, [...(map.get(c) ?? []), r]);
  }
  return [...map];
}

/** One SKU as a tap target: power (or color / code) on top, on-hand qty as a colored badge. */
function StockTile({ row, onClick }: { row: InventoryRow; onClick?: () => void }) {
  const sku = row.skuId!;
  const qty = row.qtyOnHand;
  const title = sku.power === undefined || sku.power === null ? colorOf(sku) || sku.skuCode : sku.power === 0 ? "0.00" : sku.power > 0 ? `+${sku.power.toFixed(2)}` : sku.power.toFixed(2);
  const badge = qty <= 0 ? "bg-red-50 text-red-600" : qty <= 2 ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700";
  const body = (
    <>
      <span className="max-w-full truncate text-base leading-none font-semibold text-zinc-900">{title}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>{qty <= 0 ? `หมด${qty < 0 ? ` (${qty})` : ""}` : `เหลือ ${qty}`}</span>
      {(row.onlineReservedQty ?? 0) > 0 && <span className="text-[10px] text-zinc-400">Online {row.onlineReservedQty}</span>}
    </>
  );
  const base = `flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border bg-white px-1 py-2 tabular-nums ${qty <= 0 ? "border-dashed border-zinc-300" : "border-zinc-200"}`;
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={`${base} transition hover:border-primary-400 hover:bg-primary-50 active:scale-[0.97]`}>
      {body}
    </button>
  );
}

function productName(sku: Pick<ProductSku, "productId">): string {
  return typeof sku.productId === "object" && sku.productId ? (sku.productId as Product).name : "";
}

type InventorySku = NonNullable<InventoryRow["skuId"]>;

function colorOf(sku: InventorySku): string {
  return (typeof sku.variantId === "object" && sku.variantId ? sku.variantId.colorName : undefined) ?? "";
}

/**
 * One row per model with its SKUs underneath. A model matching the search by name keeps all its SKUs;
 * one matching only by SKU code keeps just the matching SKUs.
 */
function groupByModel(items: InventoryRow[], term: string) {
  const map = new Map<string, { productId: string; productName: string; rows: InventoryRow[]; total: number; matchedBySku: boolean }>();
  for (const r of items) {
    if (!r.skuId) continue;
    const name = productName(r.skuId);
    const nameHit = !term || name.toLowerCase().includes(term);
    const skuHit = Boolean(term) && r.skuId.skuCode.toLowerCase().includes(term);
    if (!nameHit && !skuHit) continue;
    const pid = productIdOf(r.skuId);
    let g = map.get(pid);
    if (!g) map.set(pid, (g = { productId: pid, productName: name || r.skuId.skuCode, rows: [], total: 0, matchedBySku: false }));
    g.rows.push(r);
    g.total += r.qtyOnHand;
    if (skuHit && !nameHit) g.matchedBySku = true;
  }
  const groups = Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName, "th"));
  for (const g of groups) {
    g.rows.sort((a, b) => colorOf(a.skuId!).localeCompare(colorOf(b.skuId!), "th") || (b.skuId!.power ?? 0) - (a.skuId!.power ?? 0));
  }
  return groups;
}

type AdjustMode = "set" | "damage_out" | "internal_use_out";

const ADJUST_REASONS: Record<AdjustMode, string[]> = {
  set: ["นับจริงไม่ตรงระบบ", "พบของเพิ่ม", "ของหาย"],
  damage_out: ["แตก / ฉีกขาด", "หมดอายุ", "บรรจุภัณฑ์เสียหาย"],
  internal_use_out: ["ใช้ทดลอง / Tester", "ให้พนักงานใช้"],
};

function AdjustStockModal({
  branchId,
  sku,
  currentQty,
  onClose,
  onDone,
}: {
  branchId: string;
  sku: ProductSku;
  currentQty: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<AdjustMode>("set");
  const [qty, setQty] = useState(String(currentQty));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      mode === "set"
        ? apiFetch("/stock/adjust", { method: "POST", body: { branchId, skuId: sku._id, newQty: Number(qty), reason } })
        : apiFetch("/stock/write-off", { method: "POST", body: { branchId, skuId: sku._id, qty: Number(qty), type: mode, reason } }),
    onSuccess: onDone,
    onError: (err) => setError(errorMessage(err)),
  });

  const qtyValid = mode === "set" ? Number.isInteger(Number(qty)) && Number(qty) >= 0 && Number(qty) !== currentQty : Number(qty) > 0 && Number(qty) <= currentQty;

  return (
    <Modal
      title={`ปรับสต๊อก · ${sku.skuCode}`}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!reason || !qtyValid || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-zinc-500">
        {lineLabel(productName(sku), colorOf(sku as InventorySku), sku.power) || sku.skuCode} · คงเหลือปัจจุบัน <span className="text-base font-semibold text-zinc-900">{currentQty}</span>
      </p>
      <div className="flex flex-col gap-4">
        <Field label="ประเภทรายการ">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["set", "ตามที่นับจริง"],
                ["damage_out", "ตัด — เสียหาย"],
                ["internal_use_out", "ตัด — ใช้ในร้าน"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                className={`min-h-11 rounded-lg border px-2 text-sm ${mode === m ? "border-primary-500 bg-primary-50 font-medium text-primary-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
                onClick={() => {
                  setMode(m);
                  setQty(m === "set" ? String(currentQty) : "1");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label={mode === "set" ? "จำนวนที่นับได้จริง" : "จำนวนที่ตัดออก"}>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary h-11 w-11 px-0 text-lg" onClick={() => setQty(String(Math.max((Number(qty) || 0) - 1, 0)))} aria-label="ลด">
              −
            </button>
            <input
              className="input w-24 text-center text-lg font-semibold tabular-nums"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
            />
            <button type="button" className="btn-secondary h-11 w-11 px-0 text-lg" onClick={() => setQty(String((Number(qty) || 0) + 1))} aria-label="เพิ่ม">
              +
            </button>
            {mode === "set" && Number(qty) !== currentQty && qty !== "" && (
              <span className={`text-sm font-medium tabular-nums ${Number(qty) > currentQty ? "text-primary-700" : "text-red-500"}`}>
                {Number(qty) > currentQty ? "+" : ""}
                {Number(qty) - currentQty}
              </span>
            )}
          </div>
        </Field>
        <Field label="เหตุผล">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ADJUST_REASONS[mode].map((r) => (
              <button
                key={r}
                type="button"
                className={`min-h-9 rounded-full px-3 text-sm ${reason === r ? "bg-primary-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

interface AddLine {
  skuId: string;
  skuCode: string;
  productId: string;
  productName: string;
  /** Color · power — what tells SKUs of one model apart. */
  detail: string;
  qty: string;
  /** Set when the line came from a tray photo the reader wasn't sure about. */
  flag?: string;
}

function productIdOf(sku: Pick<ProductSku, "productId">): string {
  return typeof sku.productId === "object" && sku.productId ? sku.productId._id : (sku.productId as string);
}

/** Top up many SKUs at once: pick by model grid (color × power) or search SKU/barcode one by one. */
function AddStockModal({ branchId, onClose, onDone }: { branchId: string; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"model" | "sku" | "photo">("model");
  const [lines, setLines] = useState<AddLine[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("เติมสต๊อก");
  const [error, setError] = useState<string | null>(null);

  const searchQuery = useQuery({
    queryKey: ["sku-search-stock", branchId, search],
    queryFn: () => apiFetch<{ items: ProductSku[] }>("/products/skus/search", { query: { branchId, q: search } }),
    enabled: search.length > 0,
  });
  const currentQuery = useQuery({
    queryKey: ["inventory-current", branchId],
    queryFn: () => apiFetch<{ items: InventoryRow[] }>("/stock/current", { query: { branchId } }),
  });
  const inventory = (currentQuery.data?.items ?? []).filter((r) => r.skuId);
  const onHand = new Map(inventory.map((r) => [r.skuId!._id, r.qtyOnHand]));
  // Whole-model stock in this branch, across every SKU of the model (not only the ones being topped up).
  const onHandByProduct = new Map<string, number>();
  for (const r of inventory) {
    const pid = productIdOf(r.skuId!);
    onHandByProduct.set(pid, (onHandByProduct.get(pid) ?? 0) + r.qtyOnHand);
  }

  const add = (picked: Omit<PickedLine, "unitCost">[]) =>
    setLines((prev) => {
      const next = [...prev];
      for (const l of picked) {
        const i = next.findIndex((x) => x.skuId === l.skuId);
        if (i >= 0) next[i] = { ...next[i], qty: String((Number(next[i].qty) || 0) + l.qty) };
        else
          next.push({
            skuId: l.skuId,
            skuCode: l.skuCode,
            productId: l.productId ?? l.skuId,
            productName: l.productName || l.label || l.skuCode,
            detail: l.detail ?? "",
            qty: String(l.qty),
          });
      }
      return next;
    });

  const addFromPhoto = (picked: PhotoLine[]) => {
    setLines((prev) => {
      const next = [...prev];
      for (const l of picked) {
        const i = next.findIndex((x) => x.skuId === l.skuId);
        if (i >= 0) next[i] = { ...next[i], qty: String((Number(next[i].qty) || 0) + l.qty), flag: l.flag ?? next[i].flag };
        else next.push({ ...l, qty: String(l.qty) });
      }
      return next;
    });
    // Open the models that need a second look.
    setExpanded((e) => ({ ...e, ...Object.fromEntries(picked.filter((l) => l.flag).map((l) => [l.productId, true])) }));
    if (reason === "เติมสต๊อก") setReason("เติมสต๊อก (อ่านจากรูปถาด)");
  };

  const setQty = (skuId: string, qty: string) => setLines((prev) => prev.map((x) => (x.skuId === skuId ? { ...x, qty } : x)));

  const groups: { productId: string; productName: string; lines: AddLine[] }[] = [];
  for (const l of lines) {
    const g = groups.find((x) => x.productId === l.productId);
    if (g) g.lines.push(l);
    else groups.push({ productId: l.productId, productName: l.productName, lines: [l] });
  }

  const valid = lines.filter((l) => Number.isInteger(Number(l.qty)) && Number(l.qty) > 0);
  const total = valid.reduce((s, l) => s + Number(l.qty), 0);
  const allValid = lines.length > 0 && valid.length === lines.length;

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/stock/add-bulk", { method: "POST", body: { branchId, reason, items: lines.map((l) => ({ skuId: l.skuId, qty: Number(l.qty) })) } }),
    onSuccess: onDone,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title="เติมสต๊อก (หลายรายการ)"
      onClose={onClose}
      size="2xl"
      footer={
        <>
          <p className="mr-auto self-center text-xs text-zinc-400">
            {groups.length} รุ่น · {lines.length} รายการ · <span className="font-semibold text-zinc-700">+{total} ชิ้น</span>
          </p>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!allValid || !reason.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "กำลังบันทึก..." : `เติม ${total} ชิ้น`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div>
          <div className="tabs mb-2">
            <button type="button" className={`tab ${mode === "model" ? "tab-active" : ""}`} onClick={() => setMode("model")}>
              เพิ่มหลายรายการ (รุ่น × สี × ค่าสายตา)
            </button>
            <button type="button" className={`tab ${mode === "sku" ? "tab-active" : ""}`} onClick={() => setMode("sku")}>
              ค้นหาทีละ SKU / Barcode
            </button>
            <button type="button" className={`tab ${mode === "photo" ? "tab-active" : ""}`} onClick={() => setMode("photo")}>
              แนบรูปให้ระบบอ่าน
            </button>
          </div>
          {mode === "photo" ? (
            <PhotoFill branchId={branchId} onFill={addFromPhoto} />
          ) : mode === "model" ? (
            <BulkLinePicker showCost={false} onAdd={add} />
          ) : (
            <div className="relative">
              <input className="input" placeholder="ค้นหาสินค้า / SKU / Barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && searchQuery.data && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                  {searchQuery.data.items.length === 0 && <p className="p-3 text-sm text-zinc-400">ไม่พบสินค้า</p>}
                  {searchQuery.data.items.map((sku) => (
                    <button
                      key={sku._id}
                      className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50"
                      onClick={() => {
                        add([
                          {
                            skuId: sku._id,
                            skuCode: sku.skuCode,
                            label: lineLabel(productName(sku), undefined, sku.power),
                            productId: productIdOf(sku),
                            productName: productName(sku),
                            detail: lineLabel("", undefined, sku.power),
                            qty: 1,
                          },
                        ]);
                        setExpanded((e) => ({ ...e, [productIdOf(sku)]: true }));
                        setSearch("");
                      }}
                    >
                      <span>
                        <span className="text-zinc-800">{productName(sku) || sku.skuCode}</span>
                        {sku.power !== undefined && sku.power !== null && <span className="ml-2 text-xs text-zinc-500">{lineLabel("", undefined, sku.power)}</span>}
                        <span className="ml-2 font-mono text-[10px] text-zinc-300">{sku.skuCode}</span>
                      </span>
                      <span className="text-xs text-zinc-400">คงเหลือ {sku.qtyOnHand ?? 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="max-h-80 overflow-auto rounded-lg border border-zinc-100">
          <table className="data-table">
            <thead>
              <tr>
                <th>รุ่น</th>
                <th className="text-right">คงเหลือ</th>
                <th className="w-28 text-right">+ เพิ่ม</th>
                <th className="text-right">หลังเติม</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && <EmptyRow colSpan={5} text="ยังไม่มีรายการ — เลือกรุ่นแล้วใส่จำนวน หรือค้นหา SKU" />}
              {groups.map((g) => {
                const open = Boolean(expanded[g.productId]);
                const cur = onHandByProduct.get(g.productId) ?? 0;
                const added = g.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
                const toggle = () => setExpanded((e) => ({ ...e, [g.productId]: !open }));
                return [
                  <tr key={g.productId} className="cursor-pointer hover:bg-zinc-50" onClick={toggle}>
                    <td>
                      <span className="mr-2 inline-block w-3 text-zinc-400">{open ? "▾" : "▸"}</span>
                      <span className="font-medium text-zinc-800">{g.productName}</span>
                      <span className="ml-2 text-xs text-zinc-400">{g.lines.length} รายการ</span>
                      {g.lines.some((l) => l.flag) && <span className="ml-2 text-xs text-amber-600">⚠ ควรตรวจ</span>}
                    </td>
                    <td className="text-right tabular-nums text-zinc-500">{cur}</td>
                    <td className="text-right font-medium tabular-nums text-primary-700">+{added}</td>
                    <td className="text-right font-medium tabular-nums">{cur + added}</td>
                    <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <button className="link mr-3" onClick={toggle}>
                        {open ? "ซ่อน" : "แก้ไข"}
                      </button>
                      <button className="link-danger" onClick={() => setLines((prev) => prev.filter((x) => x.productId !== g.productId))}>
                        ลบ
                      </button>
                    </td>
                  </tr>,
                  ...(open
                    ? g.lines.map((l) => {
                        const lineCur = onHand.get(l.skuId) ?? 0;
                        return (
                          <tr key={l.skuId} className="bg-zinc-50/60">
                            <td className="pl-10 text-sm text-zinc-600">
                              {l.detail || "-"}
                              <span className="ml-2 font-mono text-[10px] text-zinc-300">{l.skuCode}</span>
                              {l.flag && <p className="text-[11px] text-amber-600">⚠ {l.flag}</p>}
                            </td>
                            <td className="text-right tabular-nums text-zinc-500">{lineCur}</td>
                            <td>
                              <input
                                className="input input-sm text-right"
                                inputMode="numeric"
                                value={l.qty}
                                onChange={(e) => setQty(l.skuId, e.target.value.replace(/[^\d]/g, ""))}
                              />
                            </td>
                            <td className="text-right tabular-nums">{lineCur + (Number(l.qty) || 0)}</td>
                            <td className="text-right">
                              <button className="link-danger" onClick={() => setLines((prev) => prev.filter((x) => x.skuId !== l.skuId))}>
                                ลบ
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>

        <TextField label="เหตุผล" value={reason} onChange={setReason} />
        {error && <p className="error-text">{error}</p>}
      </div>
    </Modal>
  );
}
