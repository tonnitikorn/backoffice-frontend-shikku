"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { formatMoney } from "@/lib/format";
import type { Branch } from "@/lib/types";

interface BranchDashboard {
  branch: Branch;
  summary: {
    saleCount: number;
    orderCount: number;
    storeSales: number;
    onlineSales: number;
    grossSales: number;
    discountTotal: number;
    refundTotal: number;
    netTotal: number;
    cash: number;
    transfer: number;
  };
  shiftStatus: "selling" | "pending_review" | "not_opened";
  dailySaleClosed: boolean;
  pendingOnlineOrders: number;
  pendingTransfers: number;
  lowStockCount: number;
}

const SHIFT_LABEL: Record<BranchDashboard["shiftStatus"], string> = {
  selling: "กำลังขาย",
  pending_review: "ปิดกะ รออนุมัติ",
  not_opened: "ยังไม่เปิดกะ",
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<{ branches: BranchDashboard[] }>("/dashboard"),
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="text-sm text-zinc-500">กำลังโหลด...</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">แดชบอร์ดวันนี้</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data?.branches.map(({ branch, summary, shiftStatus, dailySaleClosed, pendingOnlineOrders, pendingTransfers, lowStockCount }) => (
          <div key={branch._id} className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900">{branch.name}</h2>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    shiftStatus === "selling"
                      ? "bg-green-100 text-green-700"
                      : shiftStatus === "pending_review"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {SHIFT_LABEL[shiftStatus]}
                </span>
                {dailySaleClosed && (
                  <span className="badge-muted">ปิดยอดประจำวันแล้ว</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="ยอดหน้าร้าน" value={`฿${formatMoney(summary.storeSales)}`} />
              <Stat label="ยอด Online" value={`฿${formatMoney(summary.onlineSales)}`} />
              <Stat label="ยอดสุทธิ" value={`฿${formatMoney(summary.netTotal)}`} />
              <Stat label="ส่วนลด" value={`฿${formatMoney(summary.discountTotal)}`} />
              <Stat label="Refund" value={`฿${formatMoney(summary.refundTotal)}`} />
              <Stat label="เงินสด / โอน" value={`฿${formatMoney(summary.cash)} / ฿${formatMoney(summary.transfer)}`} />
              <Stat label="จำนวนบิล" value={String(summary.saleCount)} />
              <Stat label="Online รอดำเนินการ" value={String(pendingOnlineOrders)} />
              <Stat label="โอนสต๊อกค้างรับ" value={String(pendingTransfers)} />
              <Stat label="สินค้าใกล้หมด/หมด" value={String(lowStockCount)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="font-medium text-zinc-900">{value}</p>
    </div>
  );
}
