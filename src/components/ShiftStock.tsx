"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { Modal, Notice, errorMessage } from "@/components/ui";

export const CHANNEL_LABEL: Record<string, string> = {
  store: "หน้าร้าน",
  grab: "Grab",
  line: "LINE",
  facebook: "Facebook",
  ig: "IG",
  other: "อื่นๆ",
  online: "Online",
};

/** Money buckets in shift summaries: walk-in, Grab, and chat sales (POS LINE/FB/IG + online orders). */
export const BUCKET_LABEL: Record<string, string> = { store: "หน้าร้าน", grab: "Grab", online: "Online" };

export const PAYMENT_LABEL: Record<string, string> = { cash: "เงินสด", transfer: "โอน", qr: "QR", platform: "แพลตฟอร์ม (Grab)" };

interface StockCountState {
  shift: {
    _id: string;
    status: string;
    openedAt: string;
    openingFloat: number;
    userId?: { name: string } | null;
    shiftDefinitionId?: { name: string; startTime: string; endTime: string } | null;
  } | null;
  groups: { _id: string; name: string; unitLabel: string }[];
  open: StockCountDoc | null;
  close: StockCountDoc | null;
  handover: Handover | null;
  reference: CountReference | null;
}
interface CountReference {
  previous: { shiftSessionId: string; userName: string | null; countedAt: string } | null;
  lines: {
    groupId: string;
    previousAfter: number | null;
    movedSincePrevious: number;
    expectedBefore: number | null;
    before: number | null;
    movedSinceBefore: number;
    expectedAfter: number | null;
    sold: Record<string, number>;
    giveaway: number;
    stockIn: number;
    otherOut: number;
  }[];
}
export interface Handover {
  previous: { shiftSessionId: string; userName: string | null; countedAt: string } | null;
  lines: { groupId: string; name: string; previousAfter: number | null; movedBetween: number; expected: number | null; counted: number; diff: number | null }[];
  mismatchCount: number;
}
interface StockCountDoc {
  countedAt: string;
  note: string | null;
  lines: { groupId: string; countedQty: number; systemQty?: number }[];
}

export function useShiftStockCount(shiftId: string | undefined) {
  return useQuery({
    queryKey: ["shift-stock-count", shiftId],
    queryFn: () => apiFetch<StockCountState>(`/shifts/sessions/${shiftId}/stock-count`),
    enabled: Boolean(shiftId),
  });
}

type RefLine = CountReference["lines"][number];

/** "สายตาปกติ 99฿" → ["สายตาปกติ", "99 ฿"], like the two-line labels on the paper sheet. */
function splitPrice(name: string): [string, string | null] {
  const m = name.match(/^(.*?)\s*(\d[\d,.]*)\s*฿$/);
  return m ? [m[1], `${m[2]} ฿`] : [name, null];
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** The note written next to the "after" count on paper: ขาย 6 · grab 2 · แถม 2 · เติม 6. */
function activityNote(r: RefLine | undefined) {
  if (!r) return "";
  const parts = Object.entries(r.sold)
    .sort(([a], [b]) => (a === "store" ? -1 : b === "store" ? 1 : a.localeCompare(b)))
    .map(([ch, n]) => `${ch === "store" ? "ขาย" : CHANNEL_LABEL[ch] ?? ch} ${n}`);
  if (r.giveaway) parts.push(`แถม ${r.giveaway}`);
  if (r.stockIn) parts.push(`เติม ${r.stockIn}`);
  if (r.otherOut) parts.push(`ออกอื่น ${r.otherOut}`);
  return parts.join(" · ");
}

/**
 * The shop's paper stock sheet for one shift: "Stock ก่อนขาย" and "Stock หลังขาย" side by side,
 * each number checked against the count before it (previous shift's after / this shift's before).
 */
export function StockSheet({
  shiftId,
  onSaved,
  readOnly,
  hideHeader,
}: {
  shiftId: string;
  onSaved?: (phase: "open" | "close") => void;
  readOnly?: boolean;
  hideHeader?: boolean;
}) {
  const qc = useQueryClient();
  const query = useShiftStockCount(shiftId);
  const data = query.data;
  const [before, setBefore] = useState<Record<string, string> | null>(null);
  const [after, setAfter] = useState<Record<string, string> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saved = (phase: "open" | "close") => Object.fromEntries((data?.[phase]?.lines ?? []).map((l) => [l.groupId, String(l.countedQty)]));
  const beforeVals = before ?? saved("open");
  const afterVals = after ?? saved("close");
  const groups = data?.groups ?? [];
  const editable = !readOnly && data?.shift?.status === "open";

  const mutation = useMutation({
    mutationFn: (phase: "open" | "close") => {
      const vals = phase === "open" ? beforeVals : afterVals;
      return apiFetch(`/shifts/sessions/${shiftId}/stock-count`, {
        method: "POST",
        body: {
          phase,
          note: (note ?? data?.[phase]?.note ?? data?.open?.note ?? "") || undefined,
          lines: groups.map((g) => ({ groupId: g._id, countedQty: Number(vals[g._id]) })),
        },
      });
    },
    onSuccess: (_res, phase) => {
      if (phase === "open") setBefore(null);
      else setAfter(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ["shift-stock-count", shiftId] });
      qc.invalidateQueries({ queryKey: ["shift-summary", shiftId] });
      onSaved?.(phase);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (query.isLoading) return <Notice>กำลังโหลด...</Notice>;
  if (groups.length === 0) return <Notice>ยังไม่ได้ตั้งค่ากลุ่มนับสต๊อก (แอดมินตั้งได้ที่ ตั้งค่าระบบ → กลุ่มนับสต๊อก)</Notice>;

  const ref = data?.reference;
  const refOf = (gid: string) => ref?.lines.find((l) => l.groupId === gid);
  const complete = (vals: Record<string, string>) => groups.every((g) => vals[g._id] !== undefined && vals[g._id] !== "" && Number(vals[g._id]) >= 0);
  const lens = groups.filter((g) => g.unitLabel === "คู่");
  const other = groups.filter((g) => g.unitLabel !== "คู่");
  const shift = data?.shift;
  const def = shift?.shiftDefinitionId;

  const mismatches = (phase: "open" | "close") =>
    groups.filter((g) => {
      const v = (phase === "open" ? beforeVals : afterVals)[g._id];
      const exp = phase === "open" ? refOf(g._id)?.expectedBefore : refOf(g._id)?.expectedAfter;
      return v !== undefined && v !== "" && exp !== null && exp !== undefined && Number(v) !== exp;
    }).length;

  function sheet(phase: "open" | "close", rows: typeof groups) {
    const vals = phase === "open" ? beforeVals : afterVals;
    const setVals = phase === "open" ? setBefore : setAfter;
    return (
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th colSpan={2} className="border border-zinc-300 bg-zinc-50 py-2 text-center text-base font-semibold text-zinc-900">
              {phase === "open" ? "Stock ก่อนขาย" : "Stock หลังขาย"}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const [title, price] = splitPrice(g.name);
            const r = refOf(g._id);
            const exp = phase === "open" ? r?.expectedBefore : r?.expectedAfter;
            const base = phase === "open" ? r?.previousAfter : r?.before;
            const moved = phase === "open" ? r?.movedSincePrevious : undefined;
            const v = vals[g._id];
            const diff = v !== undefined && v !== "" && exp !== null && exp !== undefined ? Number(v) - exp : null;
            const note = phase === "close" ? activityNote(r) : "";
            return (
              <tr key={g._id} className="h-16">
                <td className="w-[38%] border border-zinc-300 px-2 py-1 text-center leading-tight">
                  <span className="block text-zinc-800">{title}</span>
                  {price && <span className="block text-xs text-zinc-500">{price}</span>}
                </td>
                <td className={`border border-zinc-300 px-2 py-1 ${diff ? "bg-red-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    {editable ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        aria-label={`${phase === "open" ? "ก่อนขาย" : "หลังขาย"} ${g.name}`}
                        className="input input-sm w-20 text-center text-base tabular-nums"
                        value={v ?? ""}
                        onChange={(e) => setVals({ ...vals, [g._id]: e.target.value })}
                      />
                    ) : (
                      <span className="w-20 text-center text-base tabular-nums">{v ?? "-"}</span>
                    )}
                    <div className="min-w-0 flex-1 text-[11px] leading-snug">
                      {note && <p className="truncate text-zinc-700" title={note}>| {note}</p>}
                      {exp !== null && exp !== undefined ? (
                        <p className={diff ? "font-medium text-red-600" : "text-zinc-400"}>
                          {phase === "open" ? `กะก่อน ${base}${moved ? ` (${signed(moved)})` : ""}` : `ควรเหลือ ${exp}`}
                          {diff === null ? "" : diff === 0 ? " ✓" : ` · ต่าง ${signed(diff)}`}
                        </p>
                      ) : (
                        <p className="text-zinc-300">{phase === "open" ? "ไม่มีข้อมูลกะก่อน" : "ยังไม่ได้นับก่อนขาย"}</p>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  const footer = (phase: "open" | "close") => {
    const doc = data?.[phase];
    const vals = phase === "open" ? beforeVals : afterVals;
    const n = mismatches(phase);
    return (
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <button className="btn-primary btn-sm" disabled={!complete(vals) || mutation.isPending} onClick={() => mutation.mutate(phase)}>
            {doc ? "บันทึกใหม่" : phase === "open" ? "บันทึก Stock ก่อนขาย" : "บันทึก Stock หลังขาย"}
          </button>
        )}
        <span className="text-xs text-zinc-500">{doc ? `บันทึกเมื่อ ${formatDateTime(doc.countedAt)}` : "ยังไม่ได้บันทึก"}</span>
        {n > 0 && <span className="text-xs font-medium text-red-600">ไม่ตรง {n} กลุ่ม</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {!hideHeader && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-2">
          <p className="text-base text-zinc-800">
            <span className="font-semibold">{shift?.userId?.name ?? "-"}</span>
            {def && ` (${def.startTime}–${def.endTime})`} · {shift ? formatDate(shift.openedAt) : ""}
          </p>
          <p className="text-sm text-zinc-600">เงินทอนตั้งต้น ฿{formatMoney(shift?.openingFloat)}</p>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        {ref?.previous
          ? `เทียบก่อนขายกับ Stock หลังขายของกะก่อน${ref.previous.userName ? ` (${ref.previous.userName})` : ""} นับเมื่อ ${formatDateTime(ref.previous.countedAt)} — ตัวเลขในวงเล็บคือของที่เข้า/ออกระหว่างกะ`
          : "ยังไม่มี Stock หลังขายของกะก่อนหน้าให้เทียบ"}
      </p>

      {[lens, other].map(
        (rows, i) =>
          rows.length > 0 && (
            <div key={i} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="overflow-x-auto">{sheet("open", rows)}</div>
              <div className="overflow-x-auto">{sheet("close", rows)}</div>
            </div>
          ),
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {footer("open")}
        {footer("close")}
      </div>
      {editable && (
        <input
          className="input"
          placeholder="หมายเหตุ (เช่น เติม Roze 6 คู่)"
          value={note ?? data?.close?.note ?? data?.open?.note ?? ""}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

interface ShiftSummary {
  shift: {
    status: string;
    branch: { name: string };
    user: { name: string };
    shiftDefinition: { name: string; startTime: string; endTime: string } | null;
    openedAt: string;
    closedAt: string | null;
    openingFloat: number;
    closingCashCounted: number | null;
    closingTransferCounted: number | null;
    cashVariance: number | null;
    varianceReason: string | null;
  };
  salesLines: { groupId: string | null; groupName: string; unitLabel: string; isLens: boolean; channel: string; unitPrice: number; qty: number; amount: number }[];
  giveaways: { skuCode: string; productName: string; qty: number; reason?: string }[];
  oversold?: { skuCode: string; productName: string; power?: number; qty: number }[];
  overrides: { skuCode: string; productName: string; qty: number; regularPrice: number; unitPrice: number; reason?: string }[];
  totals: {
    saleCount: number;
    lensQty: number;
    lensAmount: number;
    otherQty: number;
    otherAmount: number;
    cartDiscount: number;
    grossTotal: number;
    refundTotal: number;
    netTotal: number;
    byChannel: Record<string, number>;
    byBucket: { store: number; grab: number; online: number };
    onlineOrderCount: number;
    byPayment: Record<string, number>;
  };
  stock: {
    groupId: string;
    name: string;
    unitLabel: string;
    before: number | null;
    saleOut: number;
    stockIn: number;
    otherOut: number;
    expectedAfter: number | null;
    after: number | null;
    variance: number | null;
  }[];
  handover: Handover | null;
  stockCounts: { open: { countedAt: string; countedBy: string | null; note: string | null } | null; close: { countedAt: string; countedBy: string | null; note: string | null } | null };
  cash: { systemCashExpected: number; systemTransferExpected: number; cashIn: number; cashOut: number; deposits: number; cashRefunds: number };
}

export function ShiftSummaryModal({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  return (
    <Modal title="สรุปกะ" size="2xl" onClose={onClose}>
      <ShiftSummaryView shiftId={shiftId} />
    </Modal>
  );
}

/** Mirrors the shop's handwritten shift page: sales tally, totals, stock before/after, cash. */
export function ShiftSummaryView({ shiftId }: { shiftId: string }) {
  const query = useQuery({
    queryKey: ["shift-summary", shiftId],
    queryFn: () => apiFetch<ShiftSummary>(`/shifts/sessions/${shiftId}/summary`),
  });
  if (query.isLoading) return <Notice>กำลังโหลด...</Notice>;
  if (query.error) return <p className="error-text">{errorMessage(query.error)}</p>;
  const d = query.data!;
  const { shift, totals } = d;
  const lens = d.salesLines.filter((l) => l.isLens);
  const other = d.salesLines.filter((l) => !l.isLens);
  const hasNonStore = totals.byBucket.grab !== 0 || totals.byBucket.online !== 0;
  const stockVariance = d.stock.filter((s) => s.variance !== null && s.variance !== 0);
  const storeAmount = (rows: ShiftSummary["salesLines"]) => rows.filter((r) => r.channel === "store").reduce((s, r) => s + r.amount, 0);
  const totalParts = [totals.lensAmount, totals.otherAmount].filter(Boolean);
  const storeParts = [storeAmount(lens), storeAmount(other)].filter(Boolean);

  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-zinc-900">
            {shift.user?.name} · {shift.shiftDefinition ? `${shift.shiftDefinition.name} (${shift.shiftDefinition.startTime}–${shift.shiftDefinition.endTime})` : "นอกตารางกะ"}
          </p>
          <p className="text-xs text-zinc-500">
            {shift.branch?.name} · เปิด {formatDateTime(shift.openedAt)}
            {shift.closedAt ? ` · ปิด ${formatDateTime(shift.closedAt)}` : " · ยังเปิดอยู่"}
          </p>
        </div>
        <p className="text-xs text-zinc-500">เงินทอนตั้งต้น ฿{formatMoney(shift.openingFloat)}</p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 pt-3 pb-5 shadow-sm">
        <p className="mb-1 text-center text-lg tracking-wide text-zinc-800 tabular-nums">{notebookDate(shift.openedAt)}</p>
        <p className="mb-2 text-center text-xs text-zinc-400">
          {totals.saleCount} บิล{totals.onlineOrderCount > 0 && ` (ออเดอร์ออนไลน์ ${totals.onlineOrderCount})`}
        </p>
        {d.salesLines.length === 0 ? (
          <p className="py-6 text-center text-zinc-400">ยังไม่มีการขายในกะนี้</p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              <NotebookRows rows={lens} />
              {lens.length > 0 && <NotebookSubtotal qty={`${totals.lensQty} คู่`} amount={totals.lensAmount} />}
              {lens.length > 0 && other.length > 0 && <NotebookGap />}
              <NotebookRows rows={other} />
              {other.length > 0 && <NotebookSubtotal amount={totals.otherAmount} />}
              {totals.cartDiscount !== 0 && (
                <>
                  <NotebookGap />
                  <tr className="border-b border-sky-200">
                    <td className="py-1.5 text-zinc-700">ส่วนลดท้ายบิล / คูปอง</td>
                    <td className="border-l border-rose-200" />
                    <td className="border-l border-rose-200 px-2 text-right tabular-nums text-zinc-700">-{baht(totals.cartDiscount)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        )}

        {d.salesLines.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <NotebookFormula label="ยอดทั้งหมด" parts={totals.cartDiscount ? [...totalParts, -totals.cartDiscount] : totalParts} total={totals.grossTotal} />
            {hasNonStore && storeParts.length > 0 && (
              <NotebookFormula label="ยอดที่ต้องโอน (หน้าร้าน ไม่รวม online/grab)" parts={storeParts} total={storeParts.reduce((s, n) => s + n, 0)} />
            )}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["store", "grab", "online"] as const).map((b) => (
          <Tile key={b} label={BUCKET_LABEL[b]} value={totals.byBucket[b]} muted={totals.byBucket[b] === 0} />
        ))}
        <Tile label="รวมทุกช่องทาง" value={totals.grossTotal} highlight />
        {totals.refundTotal > 0 && <Tile label="คืนเงิน" value={-totals.refundTotal} />}
        {Object.entries(totals.byPayment)
          .filter(([, v]) => v !== 0)
          .map(([m, v]) => (
            <Tile key={m} label={`รับเป็น${PAYMENT_LABEL[m] ?? m}`} value={v} muted />
          ))}
      </section>

      {d.oversold && d.oversold.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 font-medium text-amber-900">ขายเกินสต๊อกในระบบ (ให้ผู้จัดการตรวจนับและปรับสต๊อก)</p>
          {d.oversold.map((o, i) => (
            <p key={i} className="text-amber-800">
              {o.productName}
              {o.power != null && ` · ${o.power > 0 ? "+" : ""}${o.power.toFixed(2)}`} ×{o.qty} <span className="text-amber-600">({o.skuCode})</span>
            </p>
          ))}
        </section>
      )}

      {(d.giveaways.length > 0 || d.overrides.length > 0) && (
        <section className="grid gap-3 md:grid-cols-2">
          {d.giveaways.length > 0 && (
            <div className="rounded-lg border border-zinc-100 p-3">
              <p className="mb-1 font-medium text-zinc-800">ของแถม</p>
              {d.giveaways.map((g, i) => (
                <p key={i} className="text-zinc-600">
                  {g.productName} ×{g.qty} <span className="text-zinc-400">— {g.reason}</span>
                </p>
              ))}
            </div>
          )}
          {d.overrides.length > 0 && (
            <div className="rounded-lg border border-zinc-100 p-3">
              <p className="mb-1 font-medium text-zinc-800">เปลี่ยนราคาเอง</p>
              {d.overrides.map((o, i) => (
                <p key={i} className="text-zinc-600">
                  {o.productName} ×{o.qty} ฿{formatMoney(o.regularPrice)} → ฿{formatMoney(o.unitPrice)} <span className="text-zinc-400">— {o.reason}</span>
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {d.handover && (
        <section>
          <h3 className="mb-2 font-medium text-zinc-800">รับต่อจากกะก่อน</h3>
          <HandoverResult handover={d.handover} />
        </section>
      )}

      <section>
        {stockVariance.length > 0 && <p className="mb-2 text-sm text-red-600">สต๊อกไม่ตรง {stockVariance.length} กลุ่ม: {stockVariance.map((s) => `${s.name} (${s.variance! > 0 ? "+" : ""}${s.variance})`).join(", ")}</p>}
        <StockSheet shiftId={shiftId} readOnly hideHeader />
        {(d.stockCounts.open?.note || d.stockCounts.close?.note) && (
          <p className="mt-2 text-xs text-zinc-500">หมายเหตุ: {[d.stockCounts.open?.note, d.stockCounts.close?.note].filter(Boolean).join(" · ")}</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="เงินสดที่ควรมี" value={d.cash.systemCashExpected} />
        <Tile label="เงินสดนับจริง" value={shift.closingCashCounted ?? undefined} />
        <Tile label="ส่วนต่างเงินสด" value={shift.cashVariance ?? undefined} warn={Boolean(shift.cashVariance)} />
        <Tile label="โอน/QR ที่ควรมี" value={d.cash.systemTransferExpected} />
        {shift.varianceReason && <p className="col-span-full text-xs text-zinc-500">เหตุผลส่วนต่าง: {shift.varianceReason}</p>}
      </section>
    </div>
  );
}

/** Whole baht like the notebook ("1,090"), keeping satang only when there are any. */
const baht = (satang: number) => formatMoney(satang).replace(/\.00$/, "");

/** "27/09/69" — the date as written at the top of the notebook page. */
const notebookDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Row label as written on paper: "ปกติ", "ปกติ (95)", "grab ปกติ (99)", "แถม ตลับ". */
function notebookLabel(r: ShiftSummary["salesLines"][number]) {
  const [title, price] = splitPrice(r.groupName);
  if (r.unitPrice === 0) return `แถม ${title}`;
  const unit = baht(r.unitPrice);
  const showPrice = r.channel !== "store" || !price || price !== `${unit} ฿`;
  const channel = r.channel === "store" ? "" : `${CHANNEL_LABEL[r.channel] ?? r.channel} `;
  return `${channel}${title}${showPrice ? ` (${unit})` : ""}`;
}

/** Tally marks in fives (||||/), the way sales are counted in the notebook. */
function Tally({ n }: { n: number }) {
  const MAX = 50;
  const shown = Math.min(n, MAX);
  const groups = Array.from({ length: Math.ceil(shown / 5) }, (_, i) => Math.min(5, shown - i * 5));
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle text-zinc-700" aria-hidden>
      {groups.map((c, i) => (
        <svg key={i} width={c === 5 ? 26 : c * 5 + 2} height="16" viewBox={`0 0 ${c === 5 ? 26 : c * 5 + 2} 16`} className="shrink-0">
          {Array.from({ length: Math.min(c, 4) }, (_, j) => (
            <line key={j} x1={3 + j * 5} y1="1" x2={3 + j * 5} y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ))}
          {c === 5 && <line x1="0" y1="12" x2="22" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
        </svg>
      ))}
      {n > MAX && <span className="text-xs text-zinc-400">…</span>}
    </span>
  );
}

function NotebookRows({ rows }: { rows: ShiftSummary["salesLines"] }) {
  return (
    <>
      {rows.map((r, i) => (
        <tr key={`${r.groupId}-${r.channel}-${r.unitPrice}-${i}`} className="border-b border-sky-200">
          <td className="py-1.5 pr-2">
            <span className={`mr-2 ${r.unitPrice === 0 ? "text-primary-700" : "text-zinc-800"}`}>{notebookLabel(r)}</span>
            <Tally n={r.qty} />
          </td>
          <td className="w-16 border-l border-rose-200 px-2 text-right tabular-nums text-zinc-800">{r.qty}</td>
          <td className="w-24 border-l border-rose-200 px-2 text-right tabular-nums text-zinc-800">{r.unitPrice === 0 ? "" : baht(r.amount)}</td>
        </tr>
      ))}
    </>
  );
}

function NotebookSubtotal({ qty, amount }: { qty?: string; amount: number }) {
  return (
    <tr>
      <td />
      <td className={`px-2 py-1.5 text-right font-semibold whitespace-nowrap tabular-nums text-zinc-900 ${qty ? "border-2 border-rose-400" : ""}`}>{qty}</td>
      <td className="border-2 border-rose-400 px-2 py-1.5 text-right font-semibold tabular-nums text-zinc-900">{baht(amount)}</td>
    </tr>
  );
}

function NotebookGap() {
  return (
    <tr className="border-b border-sky-200">
      <td colSpan={3} className="h-6" />
    </tr>
  );
}

function NotebookFormula({ label, parts, total }: { label: string; parts: number[]; total: number }) {
  const expr = parts.map((p, i) => (i === 0 ? baht(p) : p < 0 ? ` − ${baht(-p)}` : ` + ${baht(p)}`)).join("");
  return (
    <div className="text-center">
      <p className="mb-1 text-xs text-zinc-500">{label}</p>
      <p className="inline-block rounded border-2 border-rose-400 px-5 py-1.5 text-base tabular-nums text-zinc-900">
        {parts.length > 1 && <span>{expr} = </span>}
        <span className="font-semibold">{baht(total)}</span>
      </p>
    </div>
  );
}

function Tile({ label, value, highlight, muted, warn }: { label: string; value?: number; highlight?: boolean; muted?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-primary-200 bg-primary-50" : muted ? "border-zinc-100 bg-zinc-50/60" : "border-zinc-200 bg-white"}`}>
      <p className={`text-xs ${highlight ? "text-primary-700" : "text-zinc-500"}`}>{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${warn ? "text-red-600" : highlight ? "text-primary-900" : "text-zinc-900"}`}>{value === undefined ? "-" : `฿${formatMoney(value)}`}</p>
    </div>
  );
}

/** "Before" count of this shift vs the previous shift's "after" count (plus anything that moved in between). */
export function HandoverResult({ handover }: { handover: Handover }) {
  if (!handover.previous) return <p className="text-sm text-zinc-500">ไม่มีผลนับหลังขายของกะก่อนหน้าให้เทียบ</p>;
  const prev = `กะก่อน${handover.previous.userName ? ` (${handover.previous.userName})` : ""} นับเมื่อ ${formatDateTime(handover.previous.countedAt)}`;
  if (handover.mismatchCount === 0) {
    return <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">✓ ตรงกับ Stock หลังขายของ{prev} ทุกกลุ่ม</p>;
  }
  const rows = handover.lines.filter((l) => l.diff !== null && l.diff !== 0);
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
      <p className="mb-2 text-sm font-medium text-red-700">
        ไม่ตรงกับ Stock หลังขายของ{prev} {handover.mismatchCount} กลุ่ม — ลองนับกลุ่มนี้ใหม่ ถ้ายังไม่ตรงให้แจ้งผู้จัดการ
      </p>
      <div className="table-wrap bg-white">
        <table className="data-table">
          <thead>
            <tr>
              <th>กลุ่ม</th>
              <th className="text-right">กะก่อนนับได้</th>
              <th className="text-right">เข้า/ออกระหว่างกะ</th>
              <th className="text-right">ควรมี</th>
              <th className="text-right">นับได้</th>
              <th className="text-right">ต่าง</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.groupId}>
                <td>{l.name}</td>
                <td className="text-right tabular-nums">{l.previousAfter}</td>
                <td className="text-right tabular-nums">{l.movedBetween === 0 ? "" : l.movedBetween > 0 ? `+${l.movedBetween}` : l.movedBetween}</td>
                <td className="text-right tabular-nums">{l.expected}</td>
                <td className="text-right tabular-nums">{l.counted}</td>
                <td className="text-right font-medium tabular-nums text-red-600">{l.diff! > 0 ? `+${l.diff}` : l.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
