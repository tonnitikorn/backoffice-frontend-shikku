"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiClientError } from "@/lib/apiClient";
import { formatMoney, formatDateTime } from "@/lib/format";
import { RoleGate } from "@/components/RoleGate";
import type { ProductSku } from "@/lib/types";

interface Refund {
  _id: string;
  originalType: "Sale" | "Order";
  originalId: string;
  type: "refund" | "exchange";
  status: "pending" | "approved" | "rejected";
  totalRefundAmount: number;
  reason: string;
  createdAt: string;
}
interface SaleItemRow {
  _id: string;
  skuId: ProductSku;
  qty: number;
  refundedQty: number;
  unitPriceAtSale: number;
}

const CONDITIONS = [
  { value: "sealed", label: "ซีลสมบูรณ์" },
  { value: "opened", label: "เปิดกล่องแล้ว" },
  { value: "defective", label: "ชำรุด" },
  { value: "wrong_item", label: "ร้านหยิบผิด" },
];

export default function RefundsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Refund | null>(null);

  const query = useQuery({ queryKey: ["refunds"], queryFn: () => apiFetch<{ items: Refund[] }>("/refunds") });

  const [rejectReason, setRejectReason] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiFetch(`/refunds/${id}/reject`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      setSelected(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["refunds"] });
    },
    onError: (err) => setDecisionError(err instanceof ApiClientError ? err.message : "เกิดข้อผิดพลาด"),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      apiFetch(`/refunds/${id}/approve`, { method: "POST", body: { refundChannelLines: [{ method: "cash", amount }] } }),
    onSuccess: () => {
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["refunds"] });
    },
    onError: (err) => setDecisionError(err instanceof ApiClientError ? err.message : "เกิดข้อผิดพลาด"),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">คืนสินค้า / Refund</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + สร้างคำขอคืนสินค้า
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>ประเภท</th>
            <th>ยอดคืน</th>
            <th>เหตุผล</th>
            <th>สถานะ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {query.data?.items.map((r) => (
            <tr key={r._id}>
              <td>{formatDateTime(r.createdAt)}</td>
              <td>{r.type === "refund" ? "คืนเงิน" : "เปลี่ยนสินค้า"}</td>
              <td>฿{formatMoney(r.totalRefundAmount)}</td>
              <td>{r.reason}</td>
              <td>
                <span className={r.status === "pending" ? "badge-warn" : r.status === "approved" ? "badge-primary" : "badge-muted"}>
                  {r.status === "pending" ? "รออนุมัติ" : r.status === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธ"}
                </span>
              </td>
              <td>
                {r.status === "pending" && (
                  <RoleGate roles={["admin", "branch_manager"]}>
                    <button className="link" onClick={() => setSelected(r)}>
                      พิจารณา
                    </button>
                  </RoleGate>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {showCreate && <CreateRefundModal onClose={() => setShowCreate(false)} onCreated={() => {
        setShowCreate(false);
        qc.invalidateQueries({ queryKey: ["refunds"] });
      }} />}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/20 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl shadow-zinc-900/5">
            <h3 className="mb-4 text-base font-semibold text-zinc-900">พิจารณาคำขอคืนสินค้า</h3>
            <p className="mb-1 text-sm text-zinc-600">ยอดคืน ฿{formatMoney(selected.totalRefundAmount)} (คืนเป็นเงินสด)</p>
            <p className="mb-4 text-xs text-zinc-400">เหตุผล: {selected.reason}</p>
            <input className="input mb-3" placeholder="เหตุผลกรณีปฏิเสธ" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            {decisionError && <p className="error-text mb-3">{decisionError}</p>}
            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setSelected(null);
                  setDecisionError(null);
                }}
              >
                ปิด
              </button>
              <button
                className="btn-ghost text-red-500 hover:bg-red-50"
                disabled={!rejectReason || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: selected._id, reason: rejectReason })}
              >
                ปฏิเสธ
              </button>
              <button
                className="btn-primary"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate({ id: selected._id, amount: selected.totalRefundAmount })}
              >
                อนุมัติ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateRefundModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saleId, setSaleId] = useState("");
  const [sale, setSale] = useState<{ items: SaleItemRow[] } | null>(null);
  const [selections, setSelections] = useState<Record<string, { qty: string; condition: string }>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadSale = useMutation({
    mutationFn: () => apiFetch<{ sale: unknown; items: SaleItemRow[] }>(`/sales/${saleId}`),
    onSuccess: (data) => setSale({ items: data.items }),
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "ไม่พบบิล"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/refunds", {
        method: "POST",
        body: {
          originalType: "Sale",
          originalId: saleId,
          type: "refund",
          reason,
          items: Object.entries(selections)
            .filter(([, v]) => Number(v.qty) > 0)
            .map(([itemId, v]) => ({ originalItemId: itemId, qty: Number(v.qty), condition: v.condition })),
        },
      }),
    onSuccess: onCreated,
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "เกิดข้อผิดพลาด"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/20 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl shadow-zinc-900/5">
        <h3 className="mb-4 text-base font-semibold text-zinc-900">สร้างคำขอคืนสินค้า</h3>
        <div className="mb-3 flex gap-2">
          <input className="input flex-1" placeholder="เลขที่บิล (Sale ID)" value={saleId} onChange={(e) => setSaleId(e.target.value)} />
          <button className="btn-secondary" onClick={() => loadSale.mutate()}>
            ค้นหา
          </button>
        </div>

        {sale && (
          <table className="data-table mb-3">
            <thead>
              <tr>
                <th>สินค้า</th>
                <th>ซื้อ/คืนแล้ว</th>
                <th>จำนวนที่คืน</th>
                <th>สภาพสินค้า</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item._id}>
                  <td>{item.skuId.skuCode}</td>
                  <td>
                    {item.qty}/{item.refundedQty}
                  </td>
                  <td>
                    <input
                      className="input input-sm w-16"
                      value={selections[item._id]?.qty ?? ""}
                      onChange={(e) => setSelections((prev) => ({ ...prev, [item._id]: { qty: e.target.value, condition: prev[item._id]?.condition ?? "sealed" } }))}
                    />
                  </td>
                  <td>
                    <select
                      className="input input-sm w-auto"
                      value={selections[item._id]?.condition ?? "sealed"}
                      onChange={(e) => setSelections((prev) => ({ ...prev, [item._id]: { qty: prev[item._id]?.qty ?? "0", condition: e.target.value } }))}
                    >
                      {CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <input className="input mb-3" placeholder="เหตุผล" value={reason} onChange={(e) => setReason(e.target.value)} />

        {error && <p className="mb-3 error-text">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="btn-primary"
            disabled={!sale || !reason || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            ส่งคำขอ
          </button>
        </div>
      </div>
    </div>
  );
}
