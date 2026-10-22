"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { useEffectiveBranchId } from "@/lib/useEffectiveBranch";
import { bahtToSatang, formatDate, formatMoney } from "@/lib/format";
import { ConfirmDialog, EmptyRow, Field, Modal, Notice, PageHeader, TextField, errorMessage } from "@/components/ui";
import type { Product, ProductSku } from "@/lib/types";
import { BulkLinePicker, lineLabel, type PickedLine } from "./bulk-lines";

interface Supplier {
  _id: string;
  name: string;
  active: boolean;
}
interface Purchase {
  _id: string;
  supplierId: Supplier;
  branchId: { _id: string; name: string };
  invoiceNo?: string;
  purchaseDate: string;
  status: "draft" | "confirmed";
  subtotal: number;
  discountTotal: number;
  vat: number;
  shippingCost: number;
  totalCost: number;
}
interface PurchaseItemRow {
  _id: string;
  skuId: ProductSku;
  qty: number;
  unitCost: number;
  finalUnitCost: number;
}
interface LineInput {
  skuId: string;
  skuCode: string;
  label?: string;
  qty: string;
  unitCost: string;
}

export default function PurchasesPage() {
  const branchId = useEffectiveBranchId();
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === "admin" || role === "branch_manager";
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Purchase | null>(null);
  const [confirming, setConfirming] = useState<Purchase | null>(null);

  const query = useQuery({
    queryKey: ["purchases", branchId, status],
    queryFn: () => apiFetch<{ items: Purchase[] }>("/purchases", { query: { branchId, status } }),
    enabled: Boolean(branchId),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["purchases", branchId] });

  if (!branchId) return <Notice>กรุณาเลือกสาขาจากแถบด้านบน</Notice>;

  return (
    <>
      <PageHeader
        title="รับสินค้า"
        description="ใบรับสินค้าจาก Supplier — ร่างแก้ไขได้ ยืนยันแล้วสต๊อกจะเข้าทันที"
        actions={
          canWrite && (
            <button className="btn-primary" onClick={() => setEditing("new")}>
              + สร้างใบรับสินค้า
            </button>
          )
        }
      />

      <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">ทุกสถานะ</option>
        <option value="draft">ร่าง</option>
        <option value="confirmed">ยืนยันแล้ว</option>
      </select>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>Supplier</th>
              <th>เลขที่ Invoice</th>
              <th className="text-right">ยอดรวม</th>
              <th>สถานะ</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.length === 0 && <EmptyRow colSpan={6} />}
            {query.data?.items.map((p) => (
              <tr key={p._id}>
                <td className="whitespace-nowrap">{formatDate(p.purchaseDate)}</td>
                <td className="font-medium text-zinc-800">{p.supplierId?.name ?? "-"}</td>
                <td>{p.invoiceNo || "-"}</td>
                <td className="text-right tabular-nums">฿{formatMoney(p.totalCost)}</td>
                <td>{p.status === "confirmed" ? <span className="badge-primary">ยืนยันแล้ว</span> : <span className="badge-warn">ร่าง</span>}</td>
                <td>
                  <div className="flex justify-end gap-3">
                    <button className="link" onClick={() => setViewing(p._id)}>
                      ดู
                    </button>
                    {p.status === "draft" && canWrite && (
                      <>
                        <button className="link" onClick={() => setEditing(p._id)}>
                          แก้ไข
                        </button>
                        <button className="link" onClick={() => setConfirming(p)}>
                          ยืนยันรับ
                        </button>
                        <button className="link-danger" onClick={() => setDeleting(p)}>
                          ลบ
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <PurchaseFormModal
          branchId={branchId}
          purchaseId={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {viewing && <PurchaseDetailModal purchaseId={viewing} onClose={() => setViewing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="ลบใบรับสินค้า (ร่าง)"
          message={<>ต้องการลบใบรับสินค้าจาก <b>{deleting.supplierId?.name}</b> ใช่หรือไม่?</>}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/purchases/${deleting._id}`, { method: "DELETE" });
            refresh();
          }}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title="ยืนยันรับสินค้า"
          confirmLabel="ยืนยันรับสินค้า"
          message="เมื่อยืนยันแล้ว สินค้าจะถูกเพิ่มเข้าสต๊อกและอัปเดตต้นทุน และจะแก้ไขใบนี้ไม่ได้อีก"
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await apiFetch(`/purchases/${confirming._id}/confirm`, { method: "POST" });
            refresh();
            qc.invalidateQueries({ queryKey: ["inventory-current"] });
          }}
        />
      )}
    </>
  );
}

function PurchaseDetailModal({ purchaseId, onClose }: { purchaseId: string; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ["purchase", purchaseId],
    queryFn: () => apiFetch<{ purchase: Purchase; items: PurchaseItemRow[] }>(`/purchases/${purchaseId}`),
  });
  const p = detail.data?.purchase;

  return (
    <Modal title="รายละเอียดใบรับสินค้า" onClose={onClose} size="xl" footer={<button className="btn-secondary" onClick={onClose}>ปิด</button>}>
      {!detail.data || !p ? (
        <p className="text-sm text-zinc-400">กำลังโหลด...</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Info label="Supplier" value={p.supplierId?.name} />
            <Info label="สาขา" value={p.branchId?.name} />
            <Info label="วันที่" value={formatDate(p.purchaseDate)} />
            <Info label="Invoice" value={p.invoiceNo || "-"} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-100">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th className="text-right">จำนวน</th>
                  <th className="text-right">ทุน/หน่วย</th>
                  {p.status === "confirmed" && <th className="text-right">ทุนสุทธิ/หน่วย</th>}
                  <th className="text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {detail.data.items.map((i) => (
                  <tr key={i._id}>
                    <td className="font-mono text-xs">{i.skuId?.skuCode}</td>
                    <td className="text-right tabular-nums">{i.qty}</td>
                    <td className="text-right tabular-nums">฿{formatMoney(i.unitCost)}</td>
                    {p.status === "confirmed" && <td className="text-right tabular-nums">฿{formatMoney(i.finalUnitCost)}</td>}
                    <td className="text-right tabular-nums">฿{formatMoney(i.unitCost * i.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
            <SumRow label="รวมก่อนส่วนลด" value={p.subtotal} />
            <SumRow label="ส่วนลด" value={-p.discountTotal} />
            <SumRow label="ค่าขนส่ง" value={p.shippingCost} />
            <SumRow label="VAT" value={p.vat} />
            <SumRow label="ยอดสุทธิ" value={p.totalCost} bold />
          </div>
        </>
      )}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="font-medium text-zinc-800">{value ?? "-"}</p>
    </div>
  );
}

function SumRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t border-zinc-100 pt-2 font-semibold text-zinc-900" : "text-zinc-500"}`}>
      <span>{label}</span>
      <span className="tabular-nums">฿{formatMoney(value)}</span>
    </div>
  );
}

/** "Mini Olivia 850 · -1.25" when the product is populated; color is already part of the SKU code. */
function skuLabel(sku: ProductSku): string {
  const name = typeof sku.productId === "object" && sku.productId ? (sku.productId as Product).name : "";
  return name ? lineLabel(name, undefined, sku.power) : "";
}

function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function PurchaseFormModal({
  branchId,
  purchaseId,
  onClose,
  onSaved,
}: {
  branchId: string;
  purchaseId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const suppliersQuery = useQuery({ queryKey: ["suppliers", ""], queryFn: () => apiFetch<{ items: Supplier[] }>("/suppliers") });
  const existing = useQuery({
    queryKey: ["purchase", purchaseId],
    queryFn: () => apiFetch<{ purchase: Purchase; items: PurchaseItemRow[] }>(`/purchases/${purchaseId}`),
    enabled: Boolean(purchaseId),
  });

  if (purchaseId && !existing.data) {
    return (
      <Modal title="แก้ไขใบรับสินค้า" onClose={onClose}>
        <p className="pb-4 text-sm text-zinc-400">กำลังโหลด...</p>
      </Modal>
    );
  }

  return (
    <PurchaseForm
      branchId={branchId}
      purchaseId={purchaseId}
      initial={existing.data}
      suppliers={suppliersQuery.data?.items ?? []}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function PurchaseForm({
  branchId,
  purchaseId,
  initial,
  suppliers,
  onClose,
  onSaved,
}: {
  branchId: string;
  purchaseId: string | null;
  initial?: { purchase: Purchase; items: PurchaseItemRow[] };
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const p = initial?.purchase;
  const baht = (v?: number) => (v ? String(v / 100) : "");
  const [supplierId, setSupplierId] = useState(p?.supplierId?._id ?? "");
  const [invoiceNo, setInvoiceNo] = useState(p?.invoiceNo ?? "");
  const [purchaseDate, setPurchaseDate] = useState(p ? p.purchaseDate.slice(0, 10) : todayIso());
  const [discount, setDiscount] = useState(baht(p?.discountTotal));
  const [shipping, setShipping] = useState(baht(p?.shippingCost));
  const [vat, setVat] = useState(baht(p?.vat));
  const [items, setItems] = useState<LineInput[]>(
    initial?.items.map((i) => ({ skuId: i.skuId._id, skuCode: i.skuId.skuCode, label: skuLabel(i.skuId), qty: String(i.qty), unitCost: String(i.unitCost / 100) })) ?? [],
  );
  const [search, setSearch] = useState("");
  const [addMode, setAddMode] = useState<"model" | "sku">("model");
  const [error, setError] = useState<string | null>(null);

  const searchQuery = useQuery({
    queryKey: ["sku-search-purchase", branchId, search],
    queryFn: () => apiFetch<{ items: ProductSku[] }>("/products/skus/search", { query: { branchId, q: search } }),
    enabled: search.length > 0,
  });

  const subtotal = items.reduce((s, i) => s + bahtToSatang(Number(i.unitCost) || 0) * (Number(i.qty) || 0), 0);
  const total = subtotal - bahtToSatang(Number(discount) || 0) + bahtToSatang(Number(shipping) || 0) + bahtToSatang(Number(vat) || 0);
  const itemsValid = items.length > 0 && items.every((i) => Number(i.qty) > 0 && Number(i.unitCost) >= 0);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        supplierId,
        invoiceNo,
        purchaseDate: new Date(purchaseDate).toISOString(),
        discountTotal: bahtToSatang(Number(discount) || 0),
        shippingCost: bahtToSatang(Number(shipping) || 0),
        vat: bahtToSatang(Number(vat) || 0),
        items: items.map((i) => ({ skuId: i.skuId, qty: Number(i.qty), unitCost: bahtToSatang(Number(i.unitCost) || 0) })),
      };
      return purchaseId
        ? apiFetch(`/purchases/${purchaseId}`, { method: "PATCH", body })
        : apiFetch("/purchases", { method: "POST", body: { ...body, branchId } });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  // Same SKU added again adds to its quantity; a cost typed in the grid overrides the line's cost.
  const addLines = (lines: PickedLine[]) =>
    setItems((prev) => {
      const next = [...prev];
      for (const l of lines) {
        const i = next.findIndex((x) => x.skuId === l.skuId);
        if (i >= 0) next[i] = { ...next[i], qty: String((Number(next[i].qty) || 0) + l.qty), unitCost: String(l.unitCost) };
        else next.push({ skuId: l.skuId, skuCode: l.skuCode, label: l.label, qty: String(l.qty), unitCost: String(l.unitCost) });
      }
      return next;
    });

  const updateItem = (idx: number, patch: Partial<LineInput>) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));

  return (
    <Modal
      title={purchaseId ? "แก้ไขใบรับสินค้า (ร่าง)" : "สร้างใบรับสินค้า"}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!supplierId || !itemsValid || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก (ร่าง)
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Supplier">
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">เลือก Supplier</option>
            {suppliers
              .filter((s) => s.active || s._id === supplierId)
              .map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <TextField label="เลขที่ Invoice" value={invoiceNo} onChange={setInvoiceNo} />
        <TextField label="วันที่รับ" type="date" value={purchaseDate} onChange={setPurchaseDate} />
      </div>

      <div className="mt-4">
        <div className="tabs mb-2">
          <button type="button" className={`tab ${addMode === "model" ? "tab-active" : ""}`} onClick={() => setAddMode("model")}>
            เพิ่มหลายรายการ (รุ่น × สี × ค่าสายตา)
          </button>
          <button type="button" className={`tab ${addMode === "sku" ? "tab-active" : ""}`} onClick={() => setAddMode("sku")}>
            ค้นหาทีละ SKU / Barcode
          </button>
        </div>
        {addMode === "model" ? (
          <BulkLinePicker onAdd={addLines} />
        ) : (
        <div className="relative">
          <input className="input" placeholder="ค้นหาสินค้า / SKU / Barcode เพื่อเพิ่มรายการ" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && searchQuery.data && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
              {searchQuery.data.items.length === 0 && <p className="p-3 text-sm text-zinc-400">ไม่พบสินค้า</p>}
              {searchQuery.data.items.map((sku) => (
                <button
                  key={sku._id}
                  className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50"
                  onClick={() => {
                    setItems((prev) =>
                      prev.some((l) => l.skuId === sku._id)
                        ? prev.map((l) => (l.skuId === sku._id ? { ...l, qty: String(Number(l.qty) + 1) } : l))
                        : [...prev, { skuId: sku._id, skuCode: sku.skuCode, label: skuLabel(sku), qty: "1", unitCost: String((sku.cost ?? 0) / 100) }],
                    );
                    setSearch("");
                  }}
                >
                  <span>
                    <span className="font-mono text-xs">{sku.skuCode}</span>
                    <span className="ml-2 text-xs text-zinc-500">{skuLabel(sku)}</span>
                  </span>
                  <span className="text-xs text-zinc-400">คงเหลือ {sku.qtyOnHand ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-100">
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th className="w-24">จำนวน</th>
              <th className="w-32">ทุน/หน่วย (บาท)</th>
              <th className="text-right">รวม</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <EmptyRow colSpan={5} text="ยังไม่มีรายการ — ค้นหาสินค้าด้านบน" />}
            {items.map((item, idx) => (
              <tr key={item.skuId}>
                <td>
                  <span className="font-mono text-xs">{item.skuCode}</span>
                  {item.label && <span className="ml-2 text-xs text-zinc-500">{item.label}</span>}
                </td>
                <td>
                  <input type="number" className="input input-sm" value={item.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
                </td>
                <td>
                  <input type="number" className="input input-sm" value={item.unitCost} onChange={(e) => updateItem(idx, { unitCost: e.target.value })} />
                </td>
                <td className="text-right tabular-nums">฿{formatMoney(bahtToSatang(Number(item.unitCost) || 0) * (Number(item.qty) || 0))}</td>
                <td>
                  <button className="link-danger" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                    ลบ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextField label="ส่วนลดท้ายบิล (บาท)" type="number" value={discount} onChange={setDiscount} />
        <TextField label="ค่าขนส่ง (บาท)" type="number" value={shipping} onChange={setShipping} />
        <TextField label="VAT (บาท)" type="number" value={vat} onChange={setVat} />
      </div>
      <p className="mt-3 text-right text-sm text-zinc-500">
        ยอดสุทธิ <span className="text-base font-semibold text-zinc-900 tabular-nums">฿{formatMoney(total)}</span>
      </p>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}
