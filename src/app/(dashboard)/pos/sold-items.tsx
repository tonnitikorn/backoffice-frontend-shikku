"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Modal, Notice, errorMessage } from "@/components/ui";
import { BUCKET_LABEL, CHANNEL_LABEL, PAYMENT_LABEL } from "@/components/ShiftStock";
import { skuLabel } from "./product-grid";

type Bucket = "store" | "grab" | "online";
type BucketQty = Record<Bucket, number>;
const BUCKETS: Bucket[] = ["store", "grab", "online"];

interface SoldSku {
  skuId: string;
  skuCode: string;
  colorName: string | null;
  power: number | null;
  qty: number;
  giveawayQty: number;
  amount: number;
  qtyByBucket: BucketQty;
}
interface SoldProduct {
  productId: string | null;
  productName: string;
  isLens: boolean;
  qty: number;
  giveawayQty: number;
  amount: number;
  qtyByBucket: BucketQty;
  skus: SoldSku[];
}
interface Bill {
  saleId: string;
  source: "pos" | "online_order";
  createdAt: string;
  channel: string;
  bucket: Bucket;
  soldBy: string | null;
  subtotal: number;
  discountTotal: number;
  netTotal: number;
  items: { skuCode: string; productName: string; colorName: string | null; power: number | null; qty: number; unitPrice: number; lineTotal: number; overrideReason: string | null }[];
  payments: { method: string; amount: number }[];
}
interface SoldItems {
  products: SoldProduct[];
  bills: Bill[];
  totals: { saleCount: number; itemQty: number; lensQty: number; giveawayQty: number; byBucket: BucketQty; netTotal: number };
}

export const soldItemsKey = (shiftId: string) => ["shift-sold-items", shiftId];

/**
 * What the current shift has sold so far — by product (with each color/power) or bill by bill.
 * Online (chat) orders logged during the shift are included and kept apart as "Online".
 */
export function SoldItemsModal({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  const [view, setView] = useState<"products" | "bills">("products");
  const query = useQuery({
    queryKey: soldItemsKey(shiftId),
    queryFn: () => apiFetch<SoldItems>(`/shifts/sessions/${shiftId}/sold-items`),
  });

  return (
    <Modal title="สินค้าที่ขายในกะนี้" size="2xl" onClose={onClose}>
      {query.isLoading ? (
        <Notice>กำลังโหลด...</Notice>
      ) : query.error ? (
        <p className="error-text">{errorMessage(query.error)}</p>
      ) : (
        <SoldItemsBody data={query.data!} view={view} setView={setView} />
      )}
    </Modal>
  );
}

function SoldItemsBody({ data, view, setView }: { data: SoldItems; view: "products" | "bills"; setView: (v: "products" | "bills") => void }) {
  const { totals } = data;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="จำนวนบิล" value={`${totals.saleCount}`} />
        <Stat label="สินค้าทั้งหมด" value={`${totals.itemQty} ชิ้น`} />
        <Stat label="คอนแทคเลนส์" value={`${totals.lensQty} คู่`} />
        <Stat label="ยอดรวมทุกช่องทาง" value={`฿${formatMoney(totals.netTotal)}`} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {BUCKETS.map((b) => (
          <Stat key={b} label={BUCKET_LABEL[b]} value={`฿${formatMoney(totals.byBucket[b])}`} muted={totals.byBucket[b] === 0} />
        ))}
      </div>

      <div className="tabs">
        <button type="button" className={`tab ${view === "products" ? "tab-active" : ""}`} onClick={() => setView("products")}>
          ตามสินค้า
        </button>
        <button type="button" className={`tab ${view === "bills" ? "tab-active" : ""}`} onClick={() => setView("bills")}>
          ตามบิล
        </button>
      </div>

      {totals.saleCount === 0 ? (
        <p className="py-6 text-center text-zinc-400">ยังไม่มีการขายในกะนี้</p>
      ) : view === "products" ? (
        <ProductTable products={data.products} />
      ) : (
        <BillList bills={data.bills} />
      )}
    </div>
  );
}

function ProductTable({ products }: { products: SoldProduct[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
          <th className="py-2 font-medium">สินค้า</th>
          <th className="w-20 py-2 text-right font-medium">จำนวน</th>
          <th className="w-28 py-2 text-right font-medium">ยอดเงิน</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p) => {
          const key = p.productId ?? p.productName;
          const open = expanded.has(key);
          return (
            <ProductRows key={key} product={p} open={open} onToggle={() => toggle(key)} />
          );
        })}
      </tbody>
    </table>
  );
}

function ProductRows({ product: p, open, onToggle }: { product: SoldProduct; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50" onClick={onToggle}>
        <td className="py-2">
          <span className="mr-1.5 inline-block w-3 text-zinc-400">{open ? "▾" : "▸"}</span>
          <span className="font-medium text-zinc-900">{p.productName}</span>
          {p.giveawayQty > 0 && <span className="ml-2 text-xs text-primary-700">แถม {p.giveawayQty}</span>}
          <BucketSplit qty={p.qtyByBucket} />
        </td>
        <td className="py-2 text-right tabular-nums">
          {p.qty} {p.isLens ? "คู่" : "ชิ้น"}
        </td>
        <td className="py-2 text-right tabular-nums">฿{formatMoney(p.amount)}</td>
      </tr>
      {open &&
        p.skus.map((s) => (
          <tr key={s.skuId} className="border-b border-zinc-50 text-zinc-600">
            <td className="py-1.5 pl-6">
              {[s.colorName, powerLabel(s.power)].filter(Boolean).join(" · ") || s.skuCode}
              <span className="ml-2 text-xs text-zinc-400">{s.skuCode}</span>
              {s.giveawayQty > 0 && <span className="ml-2 text-xs text-primary-700">แถม {s.giveawayQty}</span>}
              <BucketSplit qty={s.qtyByBucket} />
            </td>
            <td className="py-1.5 text-right tabular-nums">{s.qty}</td>
            <td className="py-1.5 text-right tabular-nums">฿{formatMoney(s.amount)}</td>
          </tr>
        ))}
    </>
  );
}

function BillList({ bills }: { bills: Bill[] }) {
  return (
    <div className="flex flex-col gap-3">
      {bills.map((b, idx) => (
        <div key={b.saleId} className="rounded-lg border border-zinc-200 p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-zinc-900">
              บิลที่ {bills.length - idx}
              {b.bucket !== "store" && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-normal ${b.bucket === "online" ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {b.source === "online_order" ? "ออเดอร์ออนไลน์" : BUCKET_LABEL[b.bucket]}
                </span>
              )}
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {formatDateTime(b.createdAt)} · {CHANNEL_LABEL[b.channel] ?? b.channel}
                {b.soldBy ? ` · ${b.soldBy}` : ""}
              </span>
            </p>
            <p className="font-semibold tabular-nums text-zinc-900">฿{formatMoney(b.netTotal)}</p>
          </div>
          <div className="flex flex-col gap-0.5">
            {b.items.map((i, k) => (
              <div key={k} className="flex justify-between gap-2 text-zinc-600">
                <span>
                  {skuLabel(i.productName, i.colorName ?? undefined, i.power ?? undefined)} ×{i.qty}
                  {i.unitPrice === 0 && <span className="ml-1 text-xs text-primary-700">แถม</span>}
                  {i.overrideReason && i.unitPrice !== 0 && <span className="ml-1 text-xs text-amber-700">({i.overrideReason})</span>}
                </span>
                <span className="tabular-nums">฿{formatMoney(i.lineTotal)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {b.discountTotal > 0 && <>ส่วนลด ฿{formatMoney(b.discountTotal)} · </>}
            {b.payments.length === 0 ? "ยังไม่ได้รับชำระ" : b.payments.map((p) => `${PAYMENT_LABEL[p.method] ?? p.method} ฿${formatMoney(p.amount)}`).join(" + ")}
          </p>
        </div>
      ))}
    </div>
  );
}

/** "Online 2 · Grab 1" next to a row, only when part of it was not sold over the counter. */
function BucketSplit({ qty }: { qty: BucketQty }) {
  if (qty.grab === 0 && qty.online === 0) return null;
  const parts = BUCKETS.filter((b) => qty[b] > 0).map((b) => `${BUCKET_LABEL[b]} ${qty[b]}`);
  return <span className="ml-2 text-xs text-zinc-400">({parts.join(" · ")})</span>;
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${muted ? "text-zinc-400" : "text-zinc-900"}`}>{value}</p>
    </div>
  );
}

const powerLabel = (power: number | null) => (power === null ? undefined : power === 0 ? "0.00 (ปกติ)" : power.toFixed(2));
