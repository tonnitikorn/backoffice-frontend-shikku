"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiClientError } from "@/lib/apiClient";
import { useEffectiveBranchId } from "@/lib/useEffectiveBranch";
import { useIsOnline } from "@/components/OnlineStatusBanner";
import { formatDate, formatMoney } from "@/lib/format";
import type { ProductSku, ShiftSession, Customer } from "@/lib/types";
import { Modal } from "@/components/ui";
import { CHANNEL_LABEL, ShiftSummaryModal, StockSheet, useShiftStockCount } from "@/components/ShiftStock";
import { ProductGrid } from "./product-grid";
import { SoldItemsModal, soldItemsKey } from "./sold-items";
import { PromotionPicker, type PromotionOption } from "./promotion-picker";

const POS_CHANNELS = ["store", "grab", "line", "facebook", "ig"] as const;
type PosChannel = (typeof POS_CHANNELS)[number];

interface CartLine {
  sku: ProductSku;
  label: string; // model · color · power, shown instead of the SKU code
  qty: number;
  stock?: number; // system qtyOnHand when added; selling past it is flagged as an oversell
  priceOverride?: string; // baht typed by the cashier; "0" = giveaway
  overrideReason?: string;
}

interface QuoteLine {
  skuId: string;
  qty: number;
  unitPriceTiered: number;
  unitPriceFinal: number;
  lineTotal: number;
}
interface QuoteResult {
  lines: QuoteLine[];
  subtotal: number;
  discountTotal: number;
  netTotal: number;
  promotionOptions: PromotionOption[];
}

interface PaymentLine {
  method: "cash" | "transfer" | "qr" | "platform";
  amount: string;
  referenceNo?: string;
}

export default function PosPage() {
  const branchId = useEffectiveBranchId();
  const qc = useQueryClient();
  const online = useIsOnline();

  const shiftQuery = useQuery({
    queryKey: ["current-shift", branchId],
    queryFn: () => apiFetch<{ item: ShiftSession | null }>("/shifts/sessions/current", { query: { branchId } }),
    enabled: Boolean(branchId),
  });

  const [openingFloat, setOpeningFloat] = useState("");
  const openShiftMutation = useMutation({
    mutationFn: () =>
      apiFetch("/shifts/sessions/open", {
        method: "POST",
        body: { branchId, openingFloat: Math.round(Number(openingFloat) * 100) },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["current-shift", branchId] }),
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [channel, setChannel] = useState<PosChannel>("store");
  const [editingPrice, setEditingPrice] = useState<CartLine | null>(null);
  const [countPhase, setCountPhase] = useState<"open" | "close" | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [soldItemsOpen, setSoldItemsOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [promotionIds, setPromotionIds] = useState<string[]>([]);
  const [manualPayments, setManualPayments] = useState<PaymentLine[] | null>(null); // null = single cash line that follows the net total
  const [message, setMessage] = useState<string | null>(null);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const cartRef = useRef<HTMLDivElement>(null);

  const customerSearch = useQuery({
    queryKey: ["customer-search", customerPhone],
    queryFn: () => apiFetch<{ items: Customer[] }>("/customers", { query: { q: customerPhone } }),
    enabled: customerPhone.length >= 3 && !customer,
  });

  function addToCart(sku: ProductSku, label: string, stock?: number) {
    setCart((prev) => {
      const existing = prev.find((l) => l.sku._id === sku._id);
      if (existing) return prev.map((l) => (l.sku._id === sku._id ? { ...l, qty: l.qty + 1, stock: stock ?? l.stock } : l));
      return [...prev, { sku, label, qty: 1, stock }];
    });
    setManualPayments(null);
    setMessage(null);
  }

  function setOverride(skuId: string, priceOverride: string | undefined, overrideReason: string | undefined) {
    setCart((prev) => prev.map((l) => (l.sku._id === skuId ? { ...l, priceOverride, overrideReason } : l)));
    setManualPayments(null);
  }

  const isOversell = (l: CartLine) => l.stock !== undefined && l.qty > l.stock;
  const itemsPayload = cart.map((l) => ({
    skuId: l.sku._id,
    qty: l.qty,
    ...(isOversell(l) ? { allowOversell: true } : {}),
    ...(l.priceOverride !== undefined ? { unitPriceOverride: Math.round(Number(l.priceOverride) * 100), overrideReason: l.overrideReason } : {}),
  }));

  function updateQty(skuId: string, qty: number) {
    setCart((prev) => (qty <= 0 ? prev.filter((l) => l.sku._id !== skuId) : prev.map((l) => (l.sku._id === skuId ? { ...l, qty } : l))));
  }

  const quoteQuery = useQuery({
    queryKey: ["quote", branchId, channel, cart.map((l) => `${l.sku._id}:${l.qty}:${l.priceOverride ?? ""}`).join(","), customer?._id, couponCode, promotionIds.join(",")],
    queryFn: () =>
      apiFetch<QuoteResult>("/sales/quote", {
        method: "POST",
        body: {
          branchId,
          channel,
          customerId: customer?._id,
          couponCode: couponCode || undefined,
          promotionIds,
          items: itemsPayload,
        },
      }),
    enabled: Boolean(branchId) && cart.length > 0,
  });

  const netTotal = quoteQuery.data?.netTotal ?? 0;
  const defaultMethod: PaymentLine["method"] = channel === "grab" ? "platform" : channel === "store" ? "cash" : "transfer";
  const payments: PaymentLine[] = manualPayments ?? [{ method: defaultMethod, amount: cart.length > 0 && netTotal > 0 ? (netTotal / 100).toFixed(2) : "" }];
  const setPayments = (update: (prev: PaymentLine[]) => PaymentLine[]) => setManualPayments(update(payments));
  const paymentSum = payments.reduce((s, p) => s + Math.round((Number(p.amount) || 0) * 100), 0);
  const remaining = netTotal - paymentSum;

  const shift = shiftQuery.data?.item;
  const stockCountQuery = useShiftStockCount(shift?._id);
  const needsOpenCount = (stockCountQuery.data?.groups.length ?? 0) > 0 && !stockCountQuery.data?.open;

  const createSaleMutation = useMutation({
    mutationFn: () =>
      apiFetch("/sales", {
        method: "POST",
        body: {
          branchId,
          shiftSessionId: shift?._id,
          channel,
          customerId: customer?._id,
          couponCode: couponCode || undefined,
          promotionIds,
          items: itemsPayload,
          payments: payments
            .filter((p) => Number(p.amount) > 0)
            .map((p) => ({ method: p.method, amount: Math.round(Number(p.amount) * 100), referenceNo: p.referenceNo })),
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: () => {
      setMessage("บันทึกการขายสำเร็จ");
      setCart([]);
      setChannel("store");
      setCustomer(null);
      setCustomerPhone("");
      setCouponCode("");
      setExtrasOpen(false);
      setPromotionIds([]);
      setManualPayments(null);
      qc.invalidateQueries({ queryKey: ["pos-catalog", branchId] });
      qc.invalidateQueries({ queryKey: ["pos-options"] });
      if (shift) qc.invalidateQueries({ queryKey: soldItemsKey(shift._id) });
    },
    onError: (err) =>
      setMessage(
        err instanceof ApiClientError
          ? err.message === "Insufficient stock"
            ? "สต๊อกในระบบไม่พอ — เลือกค่าสายตานั้นใหม่จากหน้าสินค้าแล้วกด “มีของจริง ขายได้”"
            : err.message
          : "เกิดข้อผิดพลาด",
      ),
  });

  if (!branchId) return <p className="text-sm text-zinc-500">กรุณาเลือกสาขาจากแถบด้านบนก่อนใช้งาน POS</p>;
  if (shiftQuery.isLoading) return <p className="text-sm text-zinc-500">กำลังตรวจสอบสถานะกะ...</p>;

  if (!shift) {
    return (
      <div className="card mx-auto mt-8 w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-zinc-900">เปิดกะก่อนเริ่มขาย</h2>
        <p className="mt-1 mb-5 text-sm text-zinc-500">นับเงินทอนในลิ้นชักแล้วกรอกยอดเพื่อเริ่มกะ</p>
        <label className="label">เงินทอนตั้งต้น (บาท)</label>
        <input
          className="input mb-3"
          value={openingFloat}
          onChange={(e) => setOpeningFloat(e.target.value)}
          type="number"
        />
        <button
          className="btn-primary w-full"
          disabled={!openingFloat || openShiftMutation.isPending}
          onClick={() => openShiftMutation.mutate()}
        >
          เปิดกะ
        </button>
        {openShiftMutation.isError && (
          <p className="mt-2 error-text">
            {openShiftMutation.error instanceof ApiClientError ? openShiftMutation.error.message : "เกิดข้อผิดพลาด"}
          </p>
        )}
      </div>
    );
  }

  const cartCount = cart.reduce((n, l) => n + l.qty, 0);
  const showExtras = extrasOpen || Boolean(customer) || couponCode !== "";

  return (
    // From 640px (iPad mini portrait and up) the POS fills the screen below the app header: only the
    // product list scrolls, so the cart and the confirm button stay in view. Phones get a bottom bar instead.
    <div className="flex flex-col gap-3 pb-24 sm:h-[calc(100dvh-7rem)] sm:pb-0">
      {needsOpenCount && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>ยังไม่ได้นับ Stock ก่อนขายของกะนี้</span>
          <button className="btn-primary" onClick={() => setCountPhase("open")}>
            นับ Stock ก่อนขาย
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="tabs">
            {POS_CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                className={`tab px-4 py-2 ${channel === c ? "tab-active" : ""}`}
                onClick={() => {
                  setChannel(c);
                  setPromotionIds([]); // promotions are scoped per channel
                  setManualPayments(null);
                }}
              >
                {CHANNEL_LABEL[c]}
              </button>
            ))}
          </div>
          <span className="text-sm text-zinc-500">
            กะวันที่ <span className="font-semibold text-zinc-900">{formatDate(shift.openedAt)}</span>
            <span className="ml-1 text-zinc-400">
              (เปิด {new Date(shift.openedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.)
            </span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <CountButton label="Stock ก่อนขาย" done={Boolean(stockCountQuery.data?.open)} onClick={() => setCountPhase("open")} />
          <CountButton label="Stock หลังขาย" done={Boolean(stockCountQuery.data?.close)} onClick={() => setCountPhase("close")} />
          <button className="btn-secondary" onClick={() => setSoldItemsOpen(true)}>
            ขายอะไรไปแล้ว
          </button>
          <button className="btn-secondary" onClick={() => setSummaryOpen(true)}>
            สรุปกะนี้
          </button>
        </div>
      </div>
      {countPhase && shift && (
        <Modal title="ใบนับสต๊อก" size="2xl" onClose={() => setCountPhase(null)}>
          <StockSheet shiftId={shift._id} />
          {countPhase === "close" && <p className="mt-3 text-xs text-zinc-500">นับเสร็จแล้วไปปิดกะ (นับเงิน) ได้ที่เมนู กะและปิดยอด</p>}
        </Modal>
      )}
      {soldItemsOpen && shift && <SoldItemsModal shiftId={shift._id} onClose={() => setSoldItemsOpen(false)} />}
      {summaryOpen && shift && <ShiftSummaryModal shiftId={shift._id} onClose={() => setSummaryOpen(false)} />}
      {editingPrice && (
        <PriceOverrideModal
          line={editingPrice}
          onClose={() => setEditingPrice(null)}
          onSave={(price, reason) => {
            setOverride(editingPrice.sku._id, price, reason);
            setEditingPrice(null);
          }}
        />
      )}

      {/* iPad portrait and up: products on the left, cart pinned on the right so checkout never needs scrolling. */}
      <div className="grid grid-cols-1 gap-4 sm:min-h-0 sm:flex-1 sm:grid-cols-[minmax(0,1fr)_290px] sm:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_330px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 sm:overflow-y-auto sm:overscroll-contain sm:pr-1">
          <ProductGrid branchId={branchId} onAdd={addToCart} />
        </div>

        <div ref={cartRef} className="card flex scroll-mt-20 flex-col overflow-hidden sm:min-h-0">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <p className="text-base font-semibold text-zinc-900">
              ตะกร้า <span className="text-zinc-400">({cartCount})</span>
            </p>
            {cart.length > 0 && (
              <button className="btn-ghost px-2 text-red-500 hover:bg-red-50" onClick={() => { setCart([]); setManualPayments(null); }}>
                ล้างตะกร้า
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {cart.length === 0 && <p className="my-4 rounded-lg bg-zinc-50 py-8 text-center text-sm text-zinc-400">แตะสินค้าทางซ้ายเพื่อเริ่มขาย</p>}
            <div className="flex flex-col divide-y divide-zinc-100">
              {cart.map((line) => {
                const quoted = quoteQuery.data?.lines.find((l) => l.skuId === line.sku._id);
                return (
                  <div key={line.sku._id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-snug font-medium text-zinc-800">{line.label}</p>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">฿{formatMoney(quoted?.lineTotal ?? line.sku.priceRegular * line.qty)}</span>
                    </div>
                    {isOversell(line) && (
                      <p className="text-xs text-amber-700">⚠ ขายเกินสต๊อก (ระบบมี {Math.max(line.stock ?? 0, 0)}) — จะแจ้งผู้จัดการตรวจ</p>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="min-h-10 rounded-lg px-2 text-left text-xs hover:bg-zinc-50"
                        onClick={() => setEditingPrice(line)}
                        title="แก้ราคา / แถม"
                      >
                        {line.priceOverride === "0" ? (
                          <span className="font-medium text-primary-700">แถม</span>
                        ) : (
                          <span className={line.priceOverride !== undefined ? "text-amber-700" : "text-zinc-500"}>
                            ฿{formatMoney(quoted?.unitPriceFinal ?? line.sku.priceRegular)} / ชิ้น
                          </span>
                        )}
                        {line.overrideReason ? (
                          <span className="text-zinc-400"> · {line.overrideReason}</span>
                        ) : (
                          <span className="ml-1.5 text-primary-700 underline decoration-dotted">แก้ราคา/แถม</span>
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <QtyButton label={line.qty === 1 ? "ลบ" : "ลด"} onClick={() => updateQty(line.sku._id, line.qty - 1)} danger={line.qty === 1}>
                          {line.qty === 1 ? "×" : "−"}
                        </QtyButton>
                        <span className="w-8 text-center text-base font-semibold tabular-nums">{line.qty}</span>
                        <QtyButton label="เพิ่ม" onClick={() => updateQty(line.sku._id, line.qty + 1)}>
                          +
                        </QtyButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-zinc-100 py-3">
                <PromotionPicker
                  options={quoteQuery.data?.promotionOptions}
                  selected={promotionIds}
                  onChange={(ids) => {
                    setPromotionIds(ids);
                    setManualPayments(null);
                  }}
                />
              </div>
            )}

            <div className="border-t border-zinc-100 py-3">
              {!showExtras ? (
                <button className="btn-ghost w-full justify-start px-2 text-primary-700" onClick={() => setExtrasOpen(true)}>
                  + เพิ่มลูกค้า / คูปอง
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="label">ลูกค้า (เบอร์โทร)</label>
                    {customer ? (
                      <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                        <span>{customer.name}</span>
                        <button className="btn-ghost px-2 text-red-500" onClick={() => setCustomer(null)}>
                          เอาออก
                        </button>
                      </div>
                    ) : (
                      <>
                        <input className="input" type="tel" inputMode="tel" autoComplete="off" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                        {customerSearch.data && customerPhone.length >= 3 && (
                          <div className="mt-1 overflow-hidden rounded-lg border border-zinc-200 bg-white text-sm shadow">
                            {customerSearch.data.items.map((c) => (
                              <button key={c._id} className="block w-full px-3 py-2.5 text-left hover:bg-zinc-50" onClick={() => setCustomer(c)}>
                                {c.name} ({c.phone})
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <label className="label">คูปอง</label>
                    <input className="input" autoCapitalize="characters" autoComplete="off" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-zinc-100 py-3">
              <p className="label mb-0">ช่องทางชำระเงิน</p>
              {payments.map((p, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    className="input w-auto"
                    value={p.method}
                    onChange={(e) => setPayments((prev) => prev.map((x, i) => (i === idx ? { ...x, method: e.target.value as PaymentLine["method"] } : x)))}
                  >
                    <option value="cash">เงินสด</option>
                    <option value="transfer">โอน</option>
                    <option value="qr">QR</option>
                    <option value="platform">แพลตฟอร์ม (Grab)</option>
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input min-w-0 flex-1 text-right tabular-nums"
                    value={p.amount}
                    onChange={(e) => setPayments((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))}
                  />
                  {payments.length > 1 && (
                    <button className="btn-ghost px-2 text-red-500" onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))} aria-label="ลบช่องทางนี้">
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button className="btn-ghost w-full justify-start px-2 text-primary-700" onClick={() => setPayments((prev) => [...prev, { method: "cash", amount: "" }])}>
                + แบ่งจ่ายหลายช่องทาง
              </button>
            </div>
          </div>

          {/* Always visible: totals and the confirm button. */}
          <div className="border-t border-zinc-200 bg-zinc-50/80 px-4 pt-3 pb-4">
            <div className="space-y-1 text-sm">
              <Row label="ยอดรวม" value={quoteQuery.data?.subtotal} />
              {(quoteQuery.data?.discountTotal ?? 0) > 0 && <Row label="ส่วนลด" value={quoteQuery.data?.discountTotal} />}
              <Row label="ยอดสุทธิ" value={netTotal} bold />
              {cart.length > 0 && remaining !== 0 && <p className="text-right text-sm text-amber-600">ยังขาดอีก ฿{formatMoney(remaining)}</p>}
              {quoteQuery.error && <p className="error-text">{quoteQuery.error instanceof ApiClientError ? quoteQuery.error.message : "คำนวณราคาไม่สำเร็จ"}</p>}
            </div>
            <button
              className="btn-primary mt-3 w-full py-4 text-lg"
              disabled={cart.length === 0 || !quoteQuery.data || remaining !== 0 || createSaleMutation.isPending || !online}
              onClick={() => createSaleMutation.mutate()}
            >
              {createSaleMutation.isPending ? "กำลังบันทึก..." : "ยืนยันการขาย"}
            </button>
            {message && <p className="mt-2 text-center text-sm text-zinc-700">{message}</p>}
          </div>
        </div>
      </div>

      {/* Phones: the cart sits below the products, so keep its summary pinned to the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur sm:hidden">
        <button
          type="button"
          className="btn-primary w-full justify-between py-3 text-base"
          onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          <span>ตะกร้า ({cartCount})</span>
          <span className="tabular-nums">฿{formatMoney(netTotal)} ›</span>
        </button>
      </div>
    </div>
  );
}

function QtyButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-lg border text-lg active:scale-95 ${
        danger ? "border-red-200 text-red-500 hover:bg-red-50" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {children}
    </button>
  );
}

const QUICK_REASONS = ["แถมรีวิว", "แถมลูกค้าประจำ", "ลดราคาลูกค้าประจำ", "สินค้ามีตำหนิ"];

function PriceOverrideModal({ line, onClose, onSave }: { line: CartLine; onClose: () => void; onSave: (price: string | undefined, reason: string | undefined) => void }) {
  const [price, setPrice] = useState(line.priceOverride ?? (line.sku.priceRegular / 100).toString());
  const [reason, setReason] = useState(line.overrideReason ?? "");
  const regular = line.sku.priceRegular / 100;
  const valid = price !== "" && Number(price) >= 0 && Number(price) <= regular && reason.trim() !== "";
  return (
    <Modal
      title={`แก้ราคา — ${line.sku.skuCode}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          {line.priceOverride !== undefined && (
            <button className="btn-ghost mr-auto" onClick={() => onSave(undefined, undefined)}>
              ใช้ราคาปกติ
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!valid} onClick={() => onSave(Number(price) === regular ? undefined : price, Number(price) === regular ? undefined : reason.trim())}>
            ตกลง
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-500">ราคาปกติ ฿{formatMoney(line.sku.priceRegular)} — ลดได้อย่างเดียว ใส่ 0 = แถม</p>
        <div className="flex gap-2">
          <input type="number" min={0} max={regular} className="input flex-1" value={price} onChange={(e) => setPrice(e.target.value)} />
          <button className="btn-secondary" onClick={() => setPrice("0")}>
            แถม
          </button>
        </div>
        <input className="input" placeholder="เหตุผล (จำเป็น)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((r) => (
            <button key={r} type="button" className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50" onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function CountButton({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button className={`btn-secondary ${done ? "text-primary-700" : ""}`} onClick={onClick}>
      {done ? "✓ " : "+ "}
      {label}
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value?: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "pt-1 text-lg font-semibold text-zinc-900" : "text-zinc-500"}`}>
      <span>{label}</span>
      <span className="tabular-nums">฿{formatMoney(value ?? 0)}</span>
    </div>
  );
}
