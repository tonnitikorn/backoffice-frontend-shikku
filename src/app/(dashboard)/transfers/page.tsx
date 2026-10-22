"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiClientError } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import type { Branch, ProductSku } from "@/lib/types";

interface Transfer {
  _id: string;
  fromBranchId: Branch;
  toBranchId: Branch;
  status: "sent" | "in_transit" | "received" | "cancelled";
  sentAt: string;
}
interface TransferItem {
  _id: string;
  skuId: ProductSku;
  qtySent: number;
  qtyReceived?: number;
}

const STATUS_LABEL: Record<Transfer["status"], string> = {
  sent: "ส่งแล้ว",
  in_transit: "กำลังขนส่ง",
  received: "รับแล้ว",
  cancelled: "ยกเลิก",
};

export default function TransfersPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["transfers"], queryFn: () => apiFetch<{ items: Transfer[] }>("/transfers") });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">โอนสต๊อกระหว่างสาขา</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + สร้างการโอน
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
        <thead>
          <tr>
            <th>วันที่ส่ง</th>
            <th>จาก</th>
            <th>ไป</th>
            <th>สถานะ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {query.data?.items.map((t) => (
            <tr key={t._id}>
              <td>{formatDateTime(t.sentAt)}</td>
              <td>{t.fromBranchId?.name}</td>
              <td>{t.toBranchId?.name}</td>
              <td>
                <span className={t.status === "received" ? "badge-primary" : t.status === "cancelled" ? "badge-muted" : "badge-warn"}>{STATUS_LABEL[t.status]}</span>
              </td>
              <td>
                <button className="link" onClick={() => setSelected(t._id)}>
                  รายละเอียด
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {showCreate && (
        <CreateTransferModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ["transfers"] });
          }}
        />
      )}

      {selected && (
        <TransferDetailModal
          transferId={selected}
          onClose={() => setSelected(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["transfers"] })}
        />
      )}
    </div>
  );
}

function CreateTransferModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiFetch<{ items: Branch[] }>("/branches") });
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<{ skuId: string; skuCode: string; qty: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const searchQuery = useQuery({
    queryKey: ["sku-search-transfer", fromBranchId, search],
    queryFn: () => apiFetch<{ items: ProductSku[] }>("/products/skus/search", { query: { branchId: fromBranchId, q: search } }),
    enabled: Boolean(fromBranchId) && search.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/transfers", {
        method: "POST",
        body: { fromBranchId, toBranchId, items: items.map((i) => ({ skuId: i.skuId, qty: Number(i.qty) })) },
      }),
    onSuccess: onCreated,
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "เกิดข้อผิดพลาด"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/20 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl shadow-zinc-900/5">
        <h3 className="mb-4 text-base font-semibold text-zinc-900">สร้างการโอนสต๊อก</h3>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">จากสาขา</label>
            <select className="input" value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)}>
              <option value="">เลือกสาขา</option>
              {branchesQuery.data?.items.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ไปสาขา</label>
            <select className="input" value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}>
              <option value="">เลือกสาขา</option>
              {branchesQuery.data?.items
                .filter((b) => b._id !== fromBranchId)
                .map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="relative mb-3">
          <input
            className="input"
            placeholder="ค้นหาสินค้า"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!fromBranchId}
          />
          {search && searchQuery.data && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
              {searchQuery.data.items.map((sku) => (
                <button
                  key={sku._id}
                  className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50"
                  onClick={() => {
                    setItems((prev) => [...prev, { skuId: sku._id, skuCode: sku.skuCode, qty: "1" }]);
                    setSearch("");
                  }}
                >
                  <span>{sku.skuCode}</span>
                  <span className="text-zinc-500">คงเหลือ {sku.qtyOnHand ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {items.map((item, idx) => (
          <div key={idx} className="mb-2 flex items-center gap-2 text-sm">
            <span className="flex-1 font-mono text-xs">{item.skuCode}</span>
            <input
              type="number"
              className="input input-sm w-20"
              value={item.qty}
              onChange={(e) => setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
            />
            <button className="link-danger" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
              ลบ
            </button>
          </div>
        ))}

        {error && <p className="mb-3 error-text">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="btn-primary"
            disabled={!fromBranchId || !toBranchId || items.length === 0 || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            ส่งของ
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferDetailModal({ transferId, onClose, onChanged }: { transferId: string; onClose: () => void; onChanged: () => void }) {
  const detail = useQuery({
    queryKey: ["transfer", transferId],
    queryFn: () => apiFetch<{ item: Transfer; items: TransferItem[] }>(`/transfers/${transferId}`),
  });
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch(`/transfers/${transferId}/cancel`, { method: "POST", body: { reason: cancelReason } }),
    onSuccess: () => {
      onChanged();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "เกิดข้อผิดพลาด"),
  });

  const markInTransitMutation = useMutation({
    mutationFn: () => apiFetch(`/transfers/${transferId}/mark-in-transit`, { method: "POST", body: {} }),
    onSuccess: () => {
      detail.refetch();
      onChanged();
    },
  });

  const receiveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/transfers/${transferId}/receive`, {
        method: "POST",
        body: {
          items: (detail.data?.items ?? []).map((i) => ({ itemId: i._id, qtyReceived: Number(receiveQty[i._id] ?? i.qtySent) })),
        },
      }),
    onSuccess: () => {
      onChanged();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "เกิดข้อผิดพลาด"),
  });

  if (!detail.data) return null;
  const { item, items } = detail.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/20 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl shadow-zinc-900/5">
        <h3 className="mb-4 text-base font-semibold text-zinc-900">
          รายละเอียดการโอน ({STATUS_LABEL[item.status]})
        </h3>
        <table className="data-table mb-4">
          <thead>
            <tr>
              <th>SKU</th>
              <th>ส่ง</th>
              {item.status !== "received" && item.status !== "cancelled" && <th>รับจริง</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i._id}>
                <td>{i.skuId.skuCode}</td>
                <td>{i.qtySent}</td>
                {item.status !== "received" && item.status !== "cancelled" && (
                  <td>
                    <input
                      className="input input-sm w-20"
                      value={receiveQty[i._id] ?? String(i.qtySent)}
                      onChange={(e) => setReceiveQty((prev) => ({ ...prev, [i._id]: e.target.value }))}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {cancelling && (
          <div className="mb-3 flex gap-2">
            <input className="input flex-1" placeholder="เหตุผลที่ยกเลิก" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            <button className="btn-danger" disabled={!cancelReason || cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
              ยืนยันยกเลิก
            </button>
          </div>
        )}
        {error && <p className="mb-3 error-text">{error}</p>}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            ปิด
          </button>
          {(item.status === "sent" || item.status === "in_transit") && !cancelling && (
            <button className="btn-ghost text-red-500 hover:bg-red-50" onClick={() => setCancelling(true)}>
              ยกเลิกการโอน
            </button>
          )}
          {item.status === "sent" && (
            <button className="btn-secondary" onClick={() => markInTransitMutation.mutate()}>
              กำลังขนส่ง
            </button>
          )}
          {(item.status === "sent" || item.status === "in_transit") && (
            <button className="btn-primary" onClick={() => receiveMutation.mutate()}>
              ยืนยันรับของ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
