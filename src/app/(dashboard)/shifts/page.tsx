"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { useEffectiveBranchId } from "@/lib/useEffectiveBranch";
import { bahtToSatang, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { ActiveBadge, ConfirmDialog, EmptyRow, Field, Modal, Notice, PageHeader, Tabs, TextField, errorMessage } from "@/components/ui";
import type { Branch } from "@/lib/types";
import { ShiftSummaryModal, StockSheet, useShiftStockCount } from "@/components/ShiftStock";

interface ShiftSessionRow {
  _id: string;
  branchId: Branch;
  userId: { name: string };
  openedAt: string;
  openingFloat: number;
  status: string;
  cashVariance?: number;
}
interface ScheduleEntry {
  _id: string;
  date: string;
  status: "draft" | "published";
  userId?: { _id: string; name: string };
  shiftDefinitionId: { _id: string; name: string; startTime: string; endTime: string } | null;
  branchId: Branch;
}
interface ShiftDefinition {
  _id: string;
  branchId: string;
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
}

type TabKey = "my" | "close" | "pending" | "schedule";

export default function ShiftsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const [tab, setTab] = useState<TabKey>("my");

  const items: { key: TabKey; label: string }[] = [
    { key: "my", label: "กะของฉัน" },
    { key: "close", label: "กะปัจจุบัน / ปิดกะ" },
  ];
  if (role === "admin" || role === "branch_manager") items.push({ key: "pending", label: "รออนุมัติ" });
  if (role === "admin") items.push({ key: "schedule", label: "จัดตารางกะ" });

  return (
    <>
      <PageHeader title="กะและปิดยอด" description="ตารางกะ การปิดกะ และการอนุมัติยอด" actions={<Tabs value={tab} onChange={setTab} items={items} />} />
      {tab === "my" && <MySchedulePanel />}
      {tab === "close" && <CloseShiftTab />}
      {tab === "pending" && <PendingPanel />}
      {tab === "schedule" && <SchedulePanel />}
    </>
  );
}

function MySchedulePanel() {
  const query = useQuery({
    queryKey: ["my-schedule"],
    queryFn: () => {
      const now = new Date();
      return apiFetch<{ items: ScheduleEntry[] }>("/shifts/schedule/mine", { query: { year: now.getFullYear(), month: now.getMonth() + 1 } });
    },
  });

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>กะ</th>
            <th>สาขา</th>
          </tr>
        </thead>
        <tbody>
          {query.data?.items.length === 0 && <EmptyRow colSpan={3} text="เดือนนี้ยังไม่มีตารางกะที่เผยแพร่" />}
          {query.data?.items.map((e) => (
            <tr key={e._id}>
              <td>{formatDate(e.date)}</td>
              <td>
                {e.shiftDefinitionId ? `${e.shiftDefinitionId.name} (${e.shiftDefinitionId.startTime}–${e.shiftDefinitionId.endTime})` : "-"}
              </td>
              <td>{e.branchId?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CloseShiftTab() {
  const branchId = useEffectiveBranchId();
  const query = useQuery({
    queryKey: ["current-shift", branchId],
    queryFn: () => apiFetch<{ item: ShiftSessionRow | null }>("/shifts/sessions/current", { query: { branchId } }),
    enabled: Boolean(branchId),
  });
  if (!branchId) return <Notice>กรุณาเลือกสาขาจากแถบด้านบน</Notice>;
  if (query.isLoading) return <Notice>กำลังโหลด...</Notice>;
  return <CloseShiftPanel key={query.data?.item?._id ?? "none"} branchId={branchId} shift={query.data?.item ?? null} />;
}

function CloseShiftPanel({ branchId, shift }: { branchId: string; shift: ShiftSessionRow | null }) {
  const qc = useQueryClient();
  const totalsQuery = useQuery({
    queryKey: ["shift-totals", shift?._id],
    queryFn: () => apiFetch<{ systemCashExpected: number; systemTransferExpected: number }>(`/shifts/sessions/${shift!._id}/expected-totals`),
    enabled: Boolean(shift),
  });

  const [cashCounted, setCashCounted] = useState("");
  const [transferCounted, setTransferCounted] = useState("");
  const [carryForward, setCarryForward] = useState("");
  const [varianceReason, setVarianceReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const closeMutation = useMutation({
    mutationFn: () => {
      const cashCountedSatang = bahtToSatang(Number(cashCounted));
      const carryForwardSatang = bahtToSatang(Number(carryForward));
      return apiFetch(`/shifts/sessions/${shift!._id}/close`, {
        method: "POST",
        body: {
          closingCashCounted: cashCountedSatang,
          closingTransferCounted: bahtToSatang(Number(transferCounted) || 0),
          carryForwardFloat: carryForwardSatang,
          cashHandedIn: Math.max(0, cashCountedSatang - carryForwardSatang),
          varianceReason: varianceReason || undefined,
        },
      });
    },
    onSuccess: () => {
      setDone(true);
      qc.invalidateQueries({ queryKey: ["current-shift", branchId] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const stockQuery = useShiftStockCount(shift?._id);
  const [showSummary, setShowSummary] = useState(false);

  if (done) return <Notice>ปิดกะเรียบร้อย รอผู้จัดการอนุมัติ</Notice>;
  if (!shift) return <Notice>ยังไม่มีกะที่เปิดอยู่ในสาขานี้ (เปิดกะได้ที่หน้า POS)</Notice>;

  const usesStockSheet = (stockQuery.data?.groups.length ?? 0) > 0;
  const closeCounted = Boolean(stockQuery.data?.close);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          เปิดกะเมื่อ {formatDateTime(shift.openedAt)} · เงินทอนตั้งต้น ฿{formatMoney(shift.openingFloat)}
        </p>
        <button className="btn-secondary" onClick={() => setShowSummary(true)}>
          ดูสรุปกะ
        </button>
      </div>
      {usesStockSheet && (
        <StepCard
          step={1}
          title="ใบนับสต๊อก (ก่อนขาย / หลังขาย)"
          done={closeCounted}
          status={closeCounted ? "นับครบแล้ว ✓" : stockQuery.data?.open ? "นับก่อนขายแล้ว · รอนับหลังขาย" : "ยังไม่ได้นับ"}
        >
          <StockSheet shiftId={shift._id} />
        </StepCard>
      )}
      {showSummary && <ShiftSummaryModal shiftId={shift._id} onClose={() => setShowSummary(false)} />}
    <div className="card max-w-md p-6">
      <h2 className="font-semibold text-zinc-900">{usesStockSheet ? "2. " : ""}ปิดกะ — นับเงิน</h2>
      <div className="my-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-primary-50 p-3">
          <p className="text-xs text-primary-700">เงินสดที่ควรมี</p>
          <p className="font-semibold text-primary-900 tabular-nums">฿{formatMoney(totalsQuery.data?.systemCashExpected)}</p>
        </div>
        <div className="rounded-lg bg-zinc-50 p-3">
          <p className="text-xs text-zinc-500">โอน/QR ที่ควรมี</p>
          <p className="font-semibold text-zinc-900 tabular-nums">฿{formatMoney(totalsQuery.data?.systemTransferExpected)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <TextField label="เงินสดที่นับจริง (บาท)" type="number" value={cashCounted} onChange={setCashCounted} />
        <TextField label="ยอดโอน/QR ที่ตรวจจริง (บาท)" type="number" value={transferCounted} onChange={setTransferCounted} />
        <TextField label="เงินทอนที่เหลือไว้ให้กะถัดไป (บาท)" type="number" value={carryForward} onChange={setCarryForward} />
        <TextField label="เหตุผล (ถ้ามีส่วนต่าง)" value={varianceReason} onChange={setVarianceReason} />
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
      {usesStockSheet && !closeCounted && <p className="mt-3 text-xs text-amber-600">ต้องบันทึก Stock หลังขายก่อนจึงจะปิดกะได้</p>}
      <button
        className="btn-primary mt-5 w-full"
        disabled={!cashCounted || !carryForward || closeMutation.isPending || (usesStockSheet && !closeCounted)}
        onClick={() => closeMutation.mutate()}
      >
        ปิดกะ
      </button>
    </div>
    </div>
  );
}

function StepCard({ step, title, done, status, children }: { step: number; title: string; done: boolean; status?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(!done);
  return (
    <div className="card p-5">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <h2 className="font-semibold text-zinc-900">
          {step}. {title}
        </h2>
        <span className={`text-xs ${done ? "text-primary-700" : "text-amber-600"}`}>{status ?? (done ? "นับแล้ว ✓" : "ยังไม่ได้นับ")}</span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

function PendingPanel() {
  const branchId = useEffectiveBranchId();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState<ShiftSessionRow | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["pending-shifts", branchId],
    queryFn: () => apiFetch<{ items: ShiftSessionRow[] }>("/shifts/sessions", { query: { branchId, status: "pending_review" } }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/shifts/sessions/${id}/approve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-shifts"] }),
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <>
      {error && <p className="error-text">{error}</p>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>สาขา</th>
              <th>พนักงาน</th>
              <th>เปิดกะเมื่อ</th>
              <th className="text-right">ส่วนต่างเงินสด</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.length === 0 && <EmptyRow colSpan={5} text="ไม่มีกะที่รออนุมัติ" />}
            {query.data?.items.map((s) => (
              <tr key={s._id}>
                <td>{s.branchId?.name}</td>
                <td className="font-medium text-zinc-800">{s.userId?.name}</td>
                <td>{formatDateTime(s.openedAt)}</td>
                <td className={`text-right tabular-nums ${s.cashVariance ? "text-red-500" : ""}`}>฿{formatMoney(s.cashVariance)}</td>
                <td>
                  <div className="flex justify-end gap-3">
                    <button className="link" onClick={() => setViewing(s._id)}>
                      สรุป
                    </button>
                    <button className="link" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(s._id)}>
                      อนุมัติ
                    </button>
                    <button className="link-danger" onClick={() => setRejecting(s)}>
                      ตีกลับ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewing && <ShiftSummaryModal shiftId={viewing} onClose={() => setViewing(null)} />}
      {rejecting && (
        <ReasonModal
          title="ตีกลับการปิดกะ"
          onClose={() => setRejecting(null)}
          onSubmit={async (reason) => {
            await apiFetch(`/shifts/sessions/${rejecting._id}/reject`, { method: "POST", body: { reason } });
            qc.invalidateQueries({ queryKey: ["pending-shifts"] });
          }}
        />
      )}
    </>
  );
}

function ReasonModal({ title, onClose, onSubmit }: { title: string; onClose: () => void; onSubmit: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="btn-danger"
            disabled={!reason || pending}
            onClick={async () => {
              setPending(true);
              try {
                await onSubmit(reason);
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setPending(false);
              }
            }}
          >
            ยืนยัน
          </button>
        </>
      }
    >
      <TextField label="เหตุผล" value={reason} onChange={setReason} />
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Schedule (admin)                                                    */
/* ------------------------------------------------------------------ */

function SchedulePanel() {
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiFetch<{ items: Branch[] }>("/branches") });
  const [branchId, setBranchId] = useState("");

  return (
    <>
      <Field label="สาขา" className="max-w-xs">
        <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">เลือกสาขา</option>
          {branchesQuery.data?.items
            .filter((b) => b.active)
            .map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
        </select>
      </Field>
      {branchId ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <ShiftDefinitionsPanel branchId={branchId} />
          </div>
          <div className="lg:col-span-3">
            <CalendarPanel branchId={branchId} />
          </div>
        </div>
      ) : (
        <Notice>เลือกสาขาเพื่อจัดการรูปแบบกะและตารางกะ</Notice>
      )}
    </>
  );
}

function ShiftDefinitionsPanel({ branchId }: { branchId: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["shift-defs", branchId],
    queryFn: () => apiFetch<{ items: ShiftDefinition[] }>("/shifts/definitions", { query: { branchId } }),
  });
  const [editing, setEditing] = useState<ShiftDefinition | "new" | null>(null);
  const [deleting, setDeleting] = useState<ShiftDefinition | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["shift-defs", branchId] });

  const toggleMutation = useMutation({
    mutationFn: (d: ShiftDefinition) => apiFetch(`/shifts/definitions/${d._id}`, { method: "PATCH", body: { active: !d.active } }),
    onSuccess: refresh,
  });

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <p className="text-sm font-medium text-zinc-700">รูปแบบกะ</p>
        <button className="btn-secondary btn-sm" onClick={() => setEditing("new")}>
          + เพิ่ม
        </button>
      </div>
      <table className="data-table">
        <tbody>
          {query.data?.items.length === 0 && <EmptyRow colSpan={3} text="ยังไม่มีรูปแบบกะ" />}
          {query.data?.items.map((d) => (
            <tr key={d._id}>
              <td>
                <p className={`font-medium ${d.active ? "text-zinc-800" : "text-zinc-400"}`}>{d.name}</p>
                <p className="text-xs text-zinc-400 tabular-nums">
                  {d.startTime}–{d.endTime}
                </p>
              </td>
              <td>
                <ActiveBadge active={d.active} />
              </td>
              <td>
                <div className="flex justify-end gap-3">
                  <button className="link" onClick={() => setEditing(d)}>
                    แก้ไข
                  </button>
                  <button className="link" onClick={() => toggleMutation.mutate(d)}>
                    {d.active ? "ปิด" : "เปิด"}
                  </button>
                  <button className="link-danger" onClick={() => setDeleting(d)}>
                    ลบ
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <ShiftDefinitionModal
          branchId={branchId}
          def={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="ลบรูปแบบกะ"
          message={
            <>
              ต้องการลบกะ <b>{deleting.name}</b> ใช่หรือไม่? หากถูกใช้ในตารางกะแล้วจะลบไม่ได้ ให้ปิดใช้งานแทน
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/shifts/definitions/${deleting._id}`, { method: "DELETE" });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ShiftDefinitionModal({ branchId, def, onClose, onSaved }: { branchId: string; def: ShiftDefinition | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(def?.name ?? "");
  const [startTime, setStartTime] = useState(def?.startTime ?? "10:00");
  const [endTime, setEndTime] = useState(def?.endTime ?? "18:00");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      def
        ? apiFetch(`/shifts/definitions/${def._id}`, { method: "PATCH", body: { name, startTime, endTime } })
        : apiFetch("/shifts/definitions", { method: "POST", body: { branchId, name, startTime, endTime } }),
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title={def ? "แก้ไขรูปแบบกะ" : "เพิ่มรูปแบบกะ"}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!name || !startTime || !endTime || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="ชื่อกะ" value={name} onChange={setName} placeholder="เช่น กะเช้า" className="sm:col-span-2" />
        <TextField label="เริ่ม" type="time" value={startTime} onChange={setStartTime} />
        <TextField label="สิ้นสุด" type="time" value={endTime} onChange={setEndTime} />
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

function CalendarPanel({ branchId }: { branchId: string }) {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [userId, setUserId] = useState("");
  const [shiftDefinitionId, setShiftDefinitionId] = useState("");
  const [date, setDate] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState<ScheduleEntry | null>(null);

  const calendarQuery = useQuery({
    queryKey: ["schedule-calendar", branchId, year, month],
    queryFn: () => apiFetch<{ items: ScheduleEntry[] }>("/shifts/schedule/calendar", { query: { branchId, year, month } }),
  });
  const defsQuery = useQuery({
    queryKey: ["shift-defs", branchId],
    queryFn: () => apiFetch<{ items: ShiftDefinition[] }>("/shifts/definitions", { query: { branchId } }),
  });
  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<{ items: { id: string; name: string; branchIds: string[]; active: boolean; role: string }[] }>("/users"),
  });
  const staff = (usersQuery.data?.items ?? []).filter((u) => u.active && (u.role === "admin" || u.branchIds.includes(branchId)));
  const refresh = () => qc.invalidateQueries({ queryKey: ["schedule-calendar", branchId] });

  const addMutation = useMutation({
    mutationFn: () => apiFetch("/shifts/schedule", { method: "POST", body: { branchId, entries: [{ userId, shiftDefinitionId, date }] } }),
    onSuccess: () => {
      setMessage({ ok: true, text: "เพิ่มเข้าตารางแล้ว (ร่าง)" });
      refresh();
    },
    onError: (err) => setMessage({ ok: false, text: errorMessage(err) }),
  });
  const publishMutation = useMutation({
    mutationFn: () => apiFetch("/shifts/schedule/publish", { method: "POST", body: { branchId, year, month } }),
    onSuccess: () => {
      setMessage({ ok: true, text: "เผยแพร่ตารางกะแล้ว" });
      refresh();
    },
    onError: (err) => setMessage({ ok: false, text: errorMessage(err) }),
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const drafts = calendarQuery.data?.items.filter((e) => e.status === "draft").length ?? 0;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
        <div className="flex items-center gap-1">
          <button className="btn-ghost btn-sm" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อน">
            ‹
          </button>
          <p className="min-w-32 text-center text-sm font-medium text-zinc-700">{monthLabel}</p>
          <button className="btn-ghost btn-sm" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป">
            ›
          </button>
        </div>
        <button className="btn-primary btn-sm" disabled={publishMutation.isPending || drafts === 0} onClick={() => publishMutation.mutate()}>
          เผยแพร่ ({drafts} ร่าง)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 border-y border-zinc-100 bg-zinc-50/50 px-5 py-4 sm:grid-cols-4">
        <Field label="พนักงาน">
          <select className="input input-sm" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">เลือก</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="กะ">
          <select className="input input-sm" value={shiftDefinitionId} onChange={(e) => setShiftDefinitionId(e.target.value)}>
            <option value="">เลือก</option>
            {defsQuery.data?.items
              .filter((d) => d.active)
              .map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.startTime}–{d.endTime})
                </option>
              ))}
          </select>
        </Field>
        <Field label="วันที่">
          <input type="date" className="input input-sm" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <button className="btn-secondary btn-sm w-full py-1.5" disabled={!userId || !shiftDefinitionId || !date || addMutation.isPending} onClick={() => addMutation.mutate()}>
            + เพิ่มเข้าตาราง
          </button>
        </div>
        {message && <p className={`col-span-full text-xs ${message.ok ? "text-primary-700" : "text-red-500"}`}>{message.text}</p>}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>พนักงาน</th>
            <th>กะ</th>
            <th>สถานะ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {calendarQuery.data?.items.length === 0 && <EmptyRow colSpan={5} text="เดือนนี้ยังไม่มีตารางกะ" />}
          {calendarQuery.data?.items.map((e) => (
            <tr key={e._id}>
              <td className="whitespace-nowrap">{formatDate(e.date)}</td>
              <td>{e.userId?.name ?? "-"}</td>
              <td>{e.shiftDefinitionId ? `${e.shiftDefinitionId.name} (${e.shiftDefinitionId.startTime}–${e.shiftDefinitionId.endTime})` : "-"}</td>
              <td>{e.status === "published" ? <span className="badge-primary">เผยแพร่แล้ว</span> : <span className="badge-warn">ร่าง</span>}</td>
              <td className="text-right">
                <button className="link-danger" onClick={() => setDeleting(e)}>
                  ลบ
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {deleting && (
        <ConfirmDialog
          title="ลบรายการตารางกะ"
          message={
            <>
              ลบกะของ <b>{deleting.userId?.name}</b> วันที่ {formatDate(deleting.date)} ใช่หรือไม่?
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/shifts/schedule/${deleting._id}`, { method: "DELETE" });
            refresh();
          }}
        />
      )}
    </div>
  );
}
