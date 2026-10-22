"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/apiClient";
import { useEffectiveBranchId } from "@/lib/useEffectiveBranch";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { EmptyRow, errorMessage } from "@/components/ui";
import { ShiftSummaryModal } from "@/components/ShiftStock";
import { RoleGate } from "@/components/RoleGate";
import type { Branch, ProductSku } from "@/lib/types";

// Categorical slots in fixed order, never cycled. SERIES_1 is primary-600 (the brand
// #93C6BF is too light against white for a data mark); SERIES_2 is a muted warm contrast.
const SERIES_1 = "#579289";
const SERIES_2 = "#c98a5e";
const INK_MUTED = "#a1a1aa";
const GRIDLINE = "#f0f0f1";

const TABS = ["sales", "products", "profit", "expiry", "dead-stock", "cash-variance", "time"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  sales: "ยอดขาย",
  products: "สินค้าขายดี",
  profit: "กำไร",
  expiry: "ใกล้หมดอายุ",
  "dead-stock": "ค้างสต๊อก",
  "cash-variance": "ส่วนต่างเงินสด",
  time: "ยอดขายตามช่วงเวลา",
};

export default function ReportsPage() {
  const branchId = useEffectiveBranchId();
  const [tab, setTab] = useState<(typeof TABS)[number]>("sales");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">รายงาน</h1>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={`tab ${tab === t ? "tab-active" : ""}`} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === "sales" && <SalesReport branchId={branchId} />}
      {tab === "products" && <ProductPerformanceReport branchId={branchId} />}
      {tab === "profit" && (
        <RoleGate roles={["admin", "branch_manager"]}>
          <ProfitReport branchId={branchId} />
        </RoleGate>
      )}
      {tab === "expiry" && <ExpiryReport branchId={branchId} />}
      {tab === "dead-stock" && <DeadStockReport branchId={branchId} />}
      {tab === "cash-variance" && (
        <RoleGate roles={["admin", "branch_manager"]}>
          <CashVarianceReport branchId={branchId} />
        </RoleGate>
      )}
      {tab === "time" && <SalesByTimeReport branchId={branchId} />}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="mb-3 text-sm font-medium text-zinc-700">{title}</h2>
      <div style={{ width: "100%", height: 320 }}>{children}</div>
    </div>
  );
}

interface ShiftSalesRow {
  shiftSessionId: string;
  branch: { _id: string; name: string } | null;
  user: { _id: string; name: string } | null;
  shiftDefinition: { _id: string; name: string; startTime: string; endTime: string } | null;
  openedAt: string | null;
  closedAt: string | null;
  saleCount: number;
  discountTotal: number;
  netTotal: number;
  refundTotal: number;
  netAfterRefund: number;
  cash: number;
  transfer: number;
  qr: number;
}
type ShiftSalesSummary = Omit<ShiftSalesRow, "shiftSessionId" | "branch" | "user" | "shiftDefinition" | "openedAt" | "closedAt"> & { shiftCount: number };

/** YYYY-MM-DD in local time, for <input type="date">. */
function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
}

function SalesReport({ branchId }: { branchId?: string }) {
  const today = toDateInput(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [shiftDefinitionId, setShiftDefinitionId] = useState("");
  const [viewingShift, setViewingShift] = useState<string | null>(null);

  const definitionsQuery = useQuery({
    queryKey: ["shift-definitions", branchId],
    queryFn: () => apiFetch<{ items: { _id: string; name: string; startTime: string; endTime: string }[] }>("/shifts/definitions", { query: { branchId } }),
  });

  const rangeValid = Boolean(from && to && from <= to);
  const query = useQuery({
    queryKey: ["report-sales-by-shift", branchId, from, to, shiftDefinitionId],
    enabled: rangeValid,
    queryFn: () =>
      apiFetch<{ summary: ShiftSalesSummary; rows: ShiftSalesRow[] }>("/reports/sales-by-shift", {
        query: {
          branchId,
          // Local day boundaries so the range matches what the user sees on the calendar.
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59.999`).toISOString(),
          shiftDefinitionId: shiftDefinitionId || undefined,
        },
      }),
  });

  const rows = query.data?.rows ?? [];
  const summary = query.data?.summary;

  // Daily totals, attributed to the day each shift opened.
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const key = r.openedAt ? toDateInput(new Date(r.openedAt)) : "-";
    byDay.set(key, (byDay.get(key) ?? 0) + r.netAfterRefund);
  }
  const chartData = Array.from(byDay, ([day, net]) => ({ label: day === "-" ? "-" : formatDate(day), net: net / 100 }));

  const presets = [
    { label: "วันนี้", from: today },
    { label: "7 วัน", from: daysAgo(6) },
    { label: "30 วัน", from: daysAgo(29) },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">ตั้งแต่วันที่</label>
          <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">ถึงวันที่</label>
          <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">กะ</label>
          <select className="input" value={shiftDefinitionId} onChange={(e) => setShiftDefinitionId(e.target.value)}>
            <option value="">ทุกกะ</option>
            {definitionsQuery.data?.items.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name} ({d.startTime}–{d.endTime})
              </option>
            ))}
            <option value="unscheduled">นอกตารางกะ</option>
          </select>
        </div>
        <div className="tabs">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`tab ${from === p.from && to === today ? "tab-active" : ""}`}
              onClick={() => {
                setFrom(p.from);
                setTo(today);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!rangeValid && <p className="text-sm text-red-500">ช่วงวันที่ไม่ถูกต้อง</p>}
      {query.error && <p className="text-sm text-red-500">{errorMessage(query.error)}</p>}

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label={`ยอดขายสุทธิ (${summary.saleCount} บิล / ${summary.shiftCount} กะ)`} value={summary.netAfterRefund} highlight />
          <StatTile label="ยอดขายก่อนคืนเงิน" value={summary.netTotal} />
          <StatTile label="ส่วนลด" value={summary.discountTotal} />
          <StatTile label="คืนเงิน" value={summary.refundTotal} />
          <StatTile label="เงินสด" value={summary.cash} />
          <StatTile label="โอน" value={summary.transfer} />
          <StatTile label="QR" value={summary.qr} />
        </div>
      )}

      {chartData.length > 1 && (
        <ChartCard title="ยอดขายสุทธิรายวัน (บาท)">
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRIDLINE} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: INK_MUTED }} axisLine={{ stroke: GRIDLINE }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: INK_MUTED }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => `฿${Number(value).toLocaleString()}`} />
              <Bar dataKey="net" name="ยอดขายสุทธิ" fill={SERIES_1} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>เปิดกะ</th>
              <th>ปิดกะ</th>
              <th>กะ</th>
              {!branchId && <th>สาขา</th>}
              <th>พนักงาน</th>
              <th className="text-right">บิล</th>
              <th className="text-right">ส่วนลด</th>
              <th className="text-right">คืนเงิน</th>
              <th className="text-right">เงินสด</th>
              <th className="text-right">โอน</th>
              <th className="text-right">QR</th>
              <th className="text-right">ยอดสุทธิ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={branchId ? 12 : 13} text={query.isLoading ? "กำลังโหลด..." : "ไม่มียอดขายในช่วงนี้"} />}
            {rows.map((r) => (
              <tr key={r.shiftSessionId}>
                <td>{formatDateTime(r.openedAt ?? undefined)}</td>
                <td>{r.closedAt ? formatDateTime(r.closedAt) : <span className="text-zinc-400">ยังเปิดอยู่</span>}</td>
                <td>{r.shiftDefinition ? `${r.shiftDefinition.name} (${r.shiftDefinition.startTime}–${r.shiftDefinition.endTime})` : "นอกตารางกะ"}</td>
                {!branchId && <td>{r.branch?.name ?? "-"}</td>}
                <td>{r.user?.name ?? "-"}</td>
                <td className="text-right">{r.saleCount}</td>
                <td className="text-right">{formatMoney(r.discountTotal)}</td>
                <td className="text-right">{formatMoney(r.refundTotal)}</td>
                <td className="text-right">{formatMoney(r.cash)}</td>
                <td className="text-right">{formatMoney(r.transfer)}</td>
                <td className="text-right">{formatMoney(r.qr)}</td>
                <td className="text-right font-medium">{formatMoney(r.netAfterRefund)}</td>
                <td className="text-right">
                  <button className="link" onClick={() => setViewingShift(r.shiftSessionId)}>
                    สรุป
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewingShift && <ShiftSummaryModal shiftId={viewingShift} onClose={() => setViewingShift(null)} />}
    </div>
  );
}

function ProductPerformanceReport({ branchId }: { branchId?: string }) {
  const query = useQuery({
    queryKey: ["report-products", branchId],
    queryFn: () =>
      apiFetch<{ items: { sku: ProductSku; qtySold: number; revenue: number; qtyOnHand: number }[] }>("/reports/product-performance", { query: { branchId } }),
  });

  const data = (query.data?.items ?? []).slice(0, 10).map((row) => ({ name: row.sku?.skuCode ?? "-", qtySold: row.qtySold }));

  return (
    <ChartCard title="สินค้าขายดี 10 อันดับ (จำนวนชิ้น)">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRIDLINE} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 12, fill: INK_MUTED }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: INK_MUTED }} axisLine={false} tickLine={false} width={90} />
          <Tooltip />
          <Bar dataKey="qtySold" name="จำนวนขาย" fill={SERIES_1} radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 12, fill: "#3f3f46" }} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ProfitReport({ branchId }: { branchId?: string }) {
  const query = useQuery({
    queryKey: ["report-profit", branchId],
    queryFn: () =>
      apiFetch<{ revenue: number; cogs: number; discountTotal: number; expenseTotal: number; refundTotal: number; grossProfit: number; netProfit: number }>(
        "/reports/profit",
        { query: { branchId } },
      ),
  });
  if (!query.data) return null;
  const d = query.data;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="รายได้" value={d.revenue} />
      <StatTile label="ต้นทุนสินค้า" value={d.cogs} />
      <StatTile label="ส่วนลด" value={d.discountTotal} />
      <StatTile label="ค่าใช้จ่าย" value={d.expenseTotal} />
      <StatTile label="Refund" value={d.refundTotal} />
      <StatTile label="กำไรขั้นต้น" value={d.grossProfit} />
      <StatTile label="กำไรสุทธิ" value={d.netProfit} highlight />
    </div>
  );
}

function StatTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${highlight ? "border-primary-200 bg-primary-50 text-primary-900" : "border-zinc-200 bg-white"}`}>
      <p className={`text-xs ${highlight ? "text-primary-700" : "text-zinc-500"}`}>{label}</p>
      <p className="mt-1 text-lg font-semibold">฿{formatMoney(value)}</p>
    </div>
  );
}

function ExpiryReport({ branchId }: { branchId?: string }) {
  const query = useQuery({
    queryKey: ["report-expiry", branchId],
    queryFn: () =>
      apiFetch<{ items: { skuId: string; expiryDate: string; qtyRemaining: number; daysRemaining: number }[] }>("/reports/expiry", { query: { branchId } }),
  });

  return (
    <div className="table-wrap">
      <table className="data-table">
      <thead>
        <tr>
          <th>SKU</th>
          <th>วันหมดอายุ</th>
          <th>คงเหลือ</th>
          <th>เหลืออีก (วัน)</th>
        </tr>
      </thead>
      <tbody>
        {query.data?.items.map((row, i) => (
          <tr key={i}>
            <td>{row.skuId}</td>
            <td>{formatDate(row.expiryDate)}</td>
            <td>{row.qtyRemaining}</td>
            <td className={`p-3 ${row.daysRemaining < 30 ? "text-red-500" : ""}`}>{row.daysRemaining}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function DeadStockReport({ branchId }: { branchId?: string }) {
  const query = useQuery({
    queryKey: ["report-dead-stock", branchId],
    queryFn: () =>
      apiFetch<{ items: { sku: ProductSku; qtyOnHand: number; daysSinceLastSale: number | null }[] }>("/reports/dead-stock", { query: { branchId } }),
  });

  return (
    <div className="table-wrap">
      <table className="data-table">
      <thead>
        <tr>
          <th>SKU</th>
          <th>คงเหลือ</th>
          <th>ไม่มีการขายมา (วัน)</th>
        </tr>
      </thead>
      <tbody>
        {query.data?.items.map((row, i) => (
          <tr key={i}>
            <td>{row.sku?.skuCode}</td>
            <td>{row.qtyOnHand}</td>
            <td>{row.daysSinceLastSale ?? "ไม่เคยขาย"}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function CashVarianceReport({ branchId }: { branchId?: string }) {
  const query = useQuery({
    queryKey: ["report-cash-variance", branchId],
    queryFn: () =>
      apiFetch<{ summaryByUser: { userId: string; totalVariance: number; sessions: number }[] }>("/reports/cash-variance", { query: { branchId } }),
  });

  return (
    <div className="table-wrap">
      <table className="data-table">
      <thead>
        <tr>
          <th>พนักงาน (User ID)</th>
          <th>จำนวนกะ</th>
          <th>ส่วนต่างรวม</th>
        </tr>
      </thead>
      <tbody>
        {query.data?.summaryByUser.map((row) => (
          <tr key={row.userId}>
            <td>{row.userId}</td>
            <td>{row.sessions}</td>
            <td className={`p-3 ${row.totalVariance !== 0 ? "text-red-500" : ""}`}>฿{formatMoney(row.totalVariance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function SalesByTimeReport({ branchId }: { branchId?: string }) {
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiFetch<{ items: Branch[] }>("/branches") });
  const query = useQuery({
    queryKey: ["report-sales-by-time", branchId],
    queryFn: () =>
      apiFetch<{ items: { _id: { bucket: number; branchId: string }; saleCount: number; netTotal: number }[] }>("/reports/sales-by-time", {
        query: { branchId, granularity: "hour" },
      }),
  });

  const branches = branchesQuery.data?.items ?? [];
  const byHour = new Map<number, Record<string, number>>();
  for (const row of query.data?.items ?? []) {
    const hour = row._id.bucket;
    if (!byHour.has(hour)) byHour.set(hour, {});
    byHour.get(hour)![row._id.branchId] = row.netTotal / 100;
  }
  const data = Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}:00`, ...byHour.get(hour) }));

  return (
    <ChartCard title="ยอดขายตามชั่วโมงของวัน">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRIDLINE} vertical={false} />
          <XAxis dataKey="hour" tick={{ fontSize: 11, fill: INK_MUTED }} axisLine={{ stroke: GRIDLINE }} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: INK_MUTED }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => `฿${Number(value).toLocaleString()}`} />
          {branches.length >= 2 && <Legend />}
          {branches.map((b, i) => (
            <Bar key={b._id} dataKey={b._id} name={b.name} fill={i === 0 ? SERIES_1 : SERIES_2} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
