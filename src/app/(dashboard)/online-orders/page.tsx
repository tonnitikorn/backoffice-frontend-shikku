"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiClientError } from "@/lib/apiClient";
import { useEffectiveBranchId } from "@/lib/useEffectiveBranch";
import { formatMoney, formatDateTime } from "@/lib/format";
import type { Order, ProductSku, ShiftSession } from "@/lib/types";
import { Modal } from "@/components/ui";
import { ProductGrid } from "../pos/product-grid";
import { PromotionPicker, type PromotionOption } from "../pos/promotion-picker";

const STATUS_LABEL: Record<string, string> = {
  pending: "รอดำเนินการ",
  confirmed: "ยืนยันแล้ว",
  packed: "แพ็คแล้ว",
  shipped: "จัดส่งแล้ว",
  delivered: "ส่งถึงแล้ว",
  cancelled: "ยกเลิก",
  refunded: "คืนเงินแล้ว",
};
const CHANNEL_LABEL: Record<string, string> = { line: "LINE", facebook: "Facebook", ig: "Instagram", other: "อื่นๆ", store: "หน้าร้าน" };
const ONLINE_CHANNELS = ["line", "facebook", "ig", "other"] as const;
const NEXT_STATUS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  refunded: [],
};

export default function OnlineOrdersPage() {
  const branchId = useEffectiveBranchId();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const query = useQuery({
    queryKey: ["orders", branchId],
    queryFn: () => apiFetch<{ items: Order[] }>("/orders", { query: { branchId } }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch(`/orders/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders", branchId] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">ออเดอร์ออนไลน์ (แชท)</h1>
        <button className="btn-primary" disabled={!branchId} title={branchId ? undefined : "เลือกสาขาก่อน"} onClick={() => setShowCreate(true)}>
          + สร้างออเดอร์
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>ช่องทาง</th>
            <th>ยอดสุทธิ</th>
            <th>สถานะ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {query.data?.items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-10 text-center text-sm text-zinc-400">
                ยังไม่มีออเดอร์
              </td>
            </tr>
          )}
          {query.data?.items.map((o) => (
            <tr key={o._id}>
              <td>{formatDateTime(o.createdAt)}</td>
              <td>{CHANNEL_LABEL[o.channel] ?? o.channel}</td>
              <td className="tabular-nums">฿{formatMoney(o.netTotal)}</td>
              <td>
                <span className={o.orderStatus === "cancelled" || o.orderStatus === "refunded" ? "badge-muted" : o.orderStatus === "delivered" ? "badge-primary" : "badge-warn"}>
                  {STATUS_LABEL[o.orderStatus] ?? o.orderStatus}
                </span>
              </td>
              <td>
                <div className="flex justify-end gap-3">
                  {NEXT_STATUS[o.orderStatus]?.map((s) => (
                    <button
                      key={s}
                      className={s === "cancelled" ? "link-danger" : "link"}
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: o._id, status: s })}
                    >
                      {s === "cancelled" ? "ยกเลิก" : `→ ${STATUS_LABEL[s]}`}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {showCreate && branchId && (
        <CreateOrderModal
          branchId={branchId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ["orders", branchId] });
            // The order lands in the open shift's summaries and cuts stock shown in POS.
            qc.invalidateQueries({ queryKey: ["shift-sold-items"] });
            qc.invalidateQueries({ queryKey: ["shift-summary"] });
            qc.invalidateQueries({ queryKey: ["pos-catalog", branchId] });
          }}
        />
      )}
    </div>
  );
}

interface OrderCartLine {
  sku: ProductSku;
  label: string;
  qty: number;
}

interface QuoteResult {
  lines: { skuId: string; unitPriceFinal: number; lineTotal: number }[];
  subtotal: number;
  discountTotal: number;
  netTotal: number;
  promotionOptions: PromotionOption[];
}

/** Same picker as POS (model → color → power). Logged orders join the branch's open shift as "Online". */
function CreateOrderModal({ branchId, onClose, onCreated }: { branchId: string; onClose: () => void; onCreated: () => void }) {
  const [channel, setChannel] = useState("line");
  const [cart, setCart] = useState<OrderCartLine[]>([]);
  const [promotionIds, setPromotionIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "qr" | "cash">("transfer");
  const [paidAmount, setPaidAmount] = useState<string | null>(null); // null = follows the net total
  const [shippingMethod, setShippingMethod] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const shiftQuery = useQuery({
    queryKey: ["current-shift", branchId],
    queryFn: () => apiFetch<{ item: ShiftSession | null }>("/shifts/sessions/current", { query: { branchId } }),
  });

  function addToCart(sku: ProductSku, label: string) {
    setCart((prev) => {
      const existing = prev.find((l) => l.sku._id === sku._id);
      if (existing) return prev.map((l) => (l.sku._id === sku._id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { sku, label, qty: 1 }];
    });
    setPaidAmount(null);
    setError(null);
  }

  function updateQty(skuId: string, qty: number) {
    setCart((prev) => (qty <= 0 ? prev.filter((l) => l.sku._id !== skuId) : prev.map((l) => (l.sku._id === skuId ? { ...l, qty } : l))));
    setPaidAmount(null);
  }

  const items = cart.map((l) => ({ skuId: l.sku._id, qty: l.qty }));
  const quoteQuery = useQuery({
    queryKey: ["quote", branchId, channel, cart.map((l) => `${l.sku._id}:${l.qty}`).join(","), promotionIds.join(",")],
    queryFn: () => apiFetch<QuoteResult>("/sales/quote", { method: "POST", body: { branchId, channel, items, promotionIds } }),
    enabled: cart.length > 0,
  });
  const netTotal = quoteQuery.data?.netTotal ?? 0;
  const paid = paidAmount ?? (netTotal > 0 ? (netTotal / 100).toFixed(2) : "");
  const paidSatang = Math.round((Number(paid) || 0) * 100);

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/orders", {
        method: "POST",
        body: {
          branchId,
          channel,
          shippingMethod: shippingMethod || undefined,
          shippingAddress: shippingAddress || undefined,
          items,
          promotionIds,
          payments: paidSatang > 0 ? [{ method: paymentMethod, amount: paidSatang }] : undefined,
          idempotencyKey,
        },
      }),
    onSuccess: onCreated,
    onError: (err) => setError(err instanceof ApiClientError ? err.message : "เกิดข้อผิดพลาด"),
  });

  const shift = shiftQuery.data?.item;

  return (
    <Modal
      title="สร้างออเดอร์ออนไลน์ (บันทึกจากแชท)"
      size="2xl"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="btn-primary"
            disabled={cart.length === 0 || !quoteQuery.data || paidSatang > netTotal || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            บันทึกออเดอร์
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-5">
        <div className="md:col-span-3">
          <ProductGrid branchId={branchId} onAdd={addToCart} />
        </div>

        <div className="flex flex-col gap-3 md:col-span-2">
          <div className="tabs">
            {ONLINE_CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                className={`tab ${channel === c ? "tab-active" : ""}`}
                onClick={() => {
                  setChannel(c);
                  setPromotionIds([]); // promotions are scoped per channel
                  setPaidAmount(null);
                }}
              >
                {CHANNEL_LABEL[c]}
              </button>
            ))}
          </div>

          <p className={`rounded-lg px-3 py-2 text-xs ${shift ? "bg-sky-50 text-sky-800" : "bg-zinc-50 text-zinc-500"}`}>
            {shift ? "ออเดอร์นี้จะรวมในสรุปกะที่เปิดอยู่ (แยกเป็นยอด Online)" : "ตอนนี้ไม่มีกะเปิดอยู่ — ออเดอร์จะไม่ถูกรวมในสรุปกะ"}
          </p>

          <div>
            <p className="label">ตะกร้า ({cart.reduce((n, l) => n + l.qty, 0)})</p>
            {cart.length === 0 && <p className="rounded-lg bg-zinc-50 py-6 text-center text-sm text-zinc-400">แตะสินค้าทางซ้ายเพื่อเพิ่ม</p>}
            <div className="flex max-h-64 flex-col divide-y divide-zinc-100 overflow-y-auto">
              {cart.map((line) => {
                const quoted = quoteQuery.data?.lines.find((l) => l.skuId === line.sku._id);
                return (
                  <div key={line.sku._id} className="flex items-start gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-zinc-800">{line.label}</p>
                      <p className="text-xs text-zinc-500">฿{formatMoney(quoted?.unitPriceFinal ?? line.sku.priceRegular)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" className="h-7 w-7 rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50" onClick={() => updateQty(line.sku._id, line.qty - 1)} aria-label="ลด">
                        −
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums">{line.qty}</span>
                      <button type="button" className="h-7 w-7 rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50" onClick={() => updateQty(line.sku._id, line.qty + 1)} aria-label="เพิ่ม">
                        +
                      </button>
                    </div>
                    <span className="w-16 text-right text-sm tabular-nums">฿{formatMoney(quoted?.lineTotal ?? line.sku.priceRegular * line.qty)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {cart.length > 0 && (
            <PromotionPicker
              options={quoteQuery.data?.promotionOptions}
              selected={promotionIds}
              onChange={(ids) => {
                setPromotionIds(ids);
                setPaidAmount(null);
              }}
            />
          )}

          <div className="space-y-1 border-t border-zinc-100 pt-3 text-sm">
            <div className="flex justify-between text-zinc-500">
              <span>ส่วนลด</span>
              <span className="tabular-nums">฿{formatMoney(quoteQuery.data?.discountTotal ?? 0)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold text-zinc-900">
              <span>ยอดสุทธิ</span>
              <span className="tabular-nums">฿{formatMoney(netTotal)}</span>
            </div>
            {quoteQuery.error && <p className="error-text">{quoteQuery.error instanceof ApiClientError ? quoteQuery.error.message : "คำนวณราคาไม่สำเร็จ"}</p>}
          </div>

          <div>
            <label className="label">รับชำระแล้ว (เว้นว่าง = ยังไม่ได้รับ)</label>
            <div className="flex gap-2">
              <select className="input input-sm w-auto" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
                <option value="transfer">โอน</option>
                <option value="qr">QR</option>
                <option value="cash">เงินสด</option>
              </select>
              <input type="number" className="input input-sm flex-1" value={paid} onChange={(e) => setPaidAmount(e.target.value)} />
            </div>
            {paidSatang > netTotal && <p className="mt-1 text-xs text-amber-600">ยอดรับเกินยอดสุทธิ</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">วิธีจัดส่ง</label>
              <input className="input input-sm" value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value)} />
            </div>
            <div>
              <label className="label">ที่อยู่จัดส่ง</label>
              <input className="input input-sm" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} />
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
