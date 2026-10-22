"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { bahtToSatang, formatDate, formatMoney } from "@/lib/format";
import { ActiveBadge, ConfirmDialog, EmptyRow, Field, Modal, PageHeader, Tabs, TextField, errorMessage } from "@/components/ui";
import type { Branch } from "@/lib/types";

type PromotionType = "percent" | "amount" | "buy_x_get_y" | "spend_x_get_y" | "coupon";

interface Promotion {
  _id: string;
  name: string;
  type: PromotionType;
  scopeBranchIds: string[];
  scopeChannels: string[];
  startAt: string;
  endAt: string;
  stackable: boolean;
  config: {
    percentOff?: number;
    amountOff?: number;
    buyQty?: number;
    getQty?: number;
    spendThreshold?: number;
    spendDiscountAmount?: number;
  };
  active: boolean;
}
interface Coupon {
  _id: string;
  code: string;
  promotionId: { _id: string; name: string } | null;
  usageLimit?: number;
  perCustomerLimit?: number;
  usedCount: number;
  active: boolean;
}

const TYPE_LABEL: Record<PromotionType, string> = {
  percent: "ลดเปอร์เซ็นต์",
  amount: "ลดจำนวนเงิน",
  buy_x_get_y: "ซื้อ X แถม Y",
  spend_x_get_y: "ซื้อครบ X ลด Y",
  coupon: "คูปอง",
};

const CHANNELS = [
  { value: "store", label: "หน้าร้าน" },
  { value: "line", label: "LINE" },
  { value: "facebook", label: "Facebook" },
  { value: "ig", label: "Instagram" },
  { value: "other", label: "อื่นๆ" },
];

function describeConfig(p: Promotion): string {
  const c = p.config ?? {};
  switch (p.type) {
    case "percent":
      return `ลด ${c.percentOff ?? 0}%`;
    case "amount":
      return `ลด ฿${formatMoney(c.amountOff)}`;
    case "buy_x_get_y":
      return `ซื้อ ${c.buyQty ?? "-"} แถม ${c.getQty ?? "-"}`;
    case "spend_x_get_y":
      return `ครบ ฿${formatMoney(c.spendThreshold)} ลด ฿${formatMoney(c.spendDiscountAmount)}`;
    default:
      return "-";
  }
}

function promoStatus(p: Promotion): { label: string; cls: string } {
  if (!p.active) return { label: "ปิดใช้งาน", cls: "badge-muted" };
  const now = Date.now();
  if (new Date(p.startAt).getTime() > now) return { label: "ยังไม่เริ่ม", cls: "badge-warn" };
  if (new Date(p.endAt).getTime() < now) return { label: "หมดอายุ", cls: "badge-muted" };
  return { label: "กำลังใช้งาน", cls: "badge-primary" };
}

type TabKey = "promotions" | "coupons";

export default function PromotionsPage() {
  const [tab, setTab] = useState<TabKey>("promotions");
  return (
    <>
      <PageHeader
        title="โปรโมชั่น"
        description="ส่วนลดและคูปองสำหรับหน้าร้านและออนไลน์"
        actions={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { key: "promotions", label: "โปรโมชั่น" },
              { key: "coupons", label: "คูปอง" },
            ]}
          />
        }
      />
      {tab === "promotions" ? <PromotionsPanel /> : <CouponsPanel />}
    </>
  );
}

function PromotionsPanel() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["promotions"], queryFn: () => apiFetch<{ items: Promotion[] }>("/promotions") });
  const [editing, setEditing] = useState<Promotion | "new" | null>(null);
  const [deleting, setDeleting] = useState<Promotion | null>(null);

  const toggleMutation = useMutation({
    mutationFn: (p: Promotion) => apiFetch(`/promotions/${p._id}`, { method: "PATCH", body: { active: !p.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });

  return (
    <>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + สร้างโปรโมชั่น
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>ประเภท</th>
              <th>เงื่อนไข</th>
              <th>ระยะเวลา</th>
              <th>ซ้อนได้</th>
              <th>สถานะ</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.length === 0 && <EmptyRow colSpan={7} text="ยังไม่มีโปรโมชั่น" />}
            {query.data?.items.map((p) => {
              const status = promoStatus(p);
              return (
                <tr key={p._id}>
                  <td className="font-medium text-zinc-800">{p.name}</td>
                  <td>{TYPE_LABEL[p.type] ?? p.type}</td>
                  <td className="text-zinc-500">{describeConfig(p)}</td>
                  <td className="whitespace-nowrap text-xs">
                    {formatDate(p.startAt)} – {formatDate(p.endAt)}
                  </td>
                  <td>{p.stackable ? "ได้" : "-"}</td>
                  <td>
                    <span className={status.cls}>{status.label}</span>
                  </td>
                  <td>
                    <div className="flex justify-end gap-3">
                      <button className="link" onClick={() => setEditing(p)}>
                        แก้ไข
                      </button>
                      <button className="link" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(p)}>
                        {p.active ? "ปิด" : "เปิด"}
                      </button>
                      <button className="link-danger" onClick={() => setDeleting(p)}>
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <PromotionFormModal
          promotion={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["promotions"] });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="ลบโปรโมชั่น"
          message={
            <>
              ต้องการลบ <b>{deleting.name}</b> ใช่หรือไม่? หากเคยถูกใช้ในบิลหรือมีคูปองผูกอยู่จะลบไม่ได้ ให้ปิดใช้งานแทน
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/promotions/${deleting._id}`, { method: "DELETE" });
            qc.invalidateQueries({ queryKey: ["promotions"] });
          }}
        />
      )}
    </>
  );
}

function toDateInput(iso: string | undefined, fallback: Date): string {
  const d = iso ? new Date(iso) : fallback;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function PromotionFormModal({ promotion, onClose, onSaved }: { promotion: Promotion | null; onClose: () => void; onSaved: () => void }) {
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiFetch<{ items: Branch[] }>("/branches") });
  const c = promotion?.config ?? {};
  const baht = (v?: number) => (v === undefined ? "" : String(v / 100));

  const [name, setName] = useState(promotion?.name ?? "");
  const [type, setType] = useState<PromotionType>(promotion?.type ?? "percent");
  const [startAt, setStartAt] = useState(() => toDateInput(promotion?.startAt, new Date()));
  const [endAt, setEndAt] = useState(() => toDateInput(promotion?.endAt, new Date(Date.now() + 30 * 86400000)));
  const [stackable, setStackable] = useState(promotion?.stackable ?? false);
  const [percentOff, setPercentOff] = useState(c.percentOff !== undefined ? String(c.percentOff) : "10");
  const [amountOff, setAmountOff] = useState(baht(c.amountOff));
  const [buyQty, setBuyQty] = useState(c.buyQty !== undefined ? String(c.buyQty) : "2");
  const [getQty, setGetQty] = useState(c.getQty !== undefined ? String(c.getQty) : "1");
  const [spendThreshold, setSpendThreshold] = useState(baht(c.spendThreshold));
  const [spendDiscountAmount, setSpendDiscountAmount] = useState(baht(c.spendDiscountAmount));
  const [channels, setChannels] = useState<string[]>(promotion?.scopeChannels ?? []);
  const [branchIds, setBranchIds] = useState<string[]>(promotion?.scopeBranchIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const config = (() => {
    switch (type) {
      case "percent":
        return { percentOff: Number(percentOff) };
      case "amount":
        return { amountOff: bahtToSatang(Number(amountOff) || 0) };
      case "buy_x_get_y":
        return { buyQty: Number(buyQty), getQty: Number(getQty) };
      case "spend_x_get_y":
        return { spendThreshold: bahtToSatang(Number(spendThreshold) || 0), spendDiscountAmount: bahtToSatang(Number(spendDiscountAmount) || 0) };
      default:
        return {};
    }
  })();

  const mutation = useMutation({
    mutationFn: () => {
      const end = new Date(endAt);
      end.setHours(23, 59, 59, 999);
      const body = {
        name,
        type,
        startAt: new Date(startAt).toISOString(),
        endAt: end.toISOString(),
        stackable,
        config,
        scopeChannels: channels,
        scopeBranchIds: branchIds,
      };
      return promotion ? apiFetch(`/promotions/${promotion._id}`, { method: "PATCH", body }) : apiFetch("/promotions", { method: "POST", body });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const chip = (checked: boolean) =>
    `cursor-pointer rounded-lg border px-2.5 py-1 text-xs ${checked ? "border-primary-300 bg-primary-50 text-primary-800" : "border-zinc-200 text-zinc-500 hover:border-zinc-300"}`;

  return (
    <Modal
      title={promotion ? "แก้ไขโปรโมชั่น" : "สร้างโปรโมชั่น"}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!name || !startAt || !endAt || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="ชื่อโปรโมชั่น" value={name} onChange={setName} className="sm:col-span-2" />
        <Field label="ประเภท" className="sm:col-span-2">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as PromotionType)}>
            <option value="percent">ลดเปอร์เซ็นต์ (ต่อชิ้น)</option>
            <option value="amount">ลดจำนวนเงิน (ต่อชิ้น)</option>
            <option value="buy_x_get_y">ซื้อ X แถม Y</option>
            <option value="spend_x_get_y">ซื้อครบ X บาท ลด Y บาท</option>
          </select>
        </Field>
        {type === "percent" && <TextField label="ลด (%)" type="number" value={percentOff} onChange={setPercentOff} />}
        {type === "amount" && <TextField label="ลด (บาท)" type="number" value={amountOff} onChange={setAmountOff} />}
        {type === "buy_x_get_y" && (
          <>
            <TextField label="ซื้อ (ชิ้น)" type="number" value={buyQty} onChange={setBuyQty} />
            <TextField label="แถม (ชิ้น)" type="number" value={getQty} onChange={setGetQty} />
          </>
        )}
        {type === "spend_x_get_y" && (
          <>
            <TextField label="ยอดซื้อขั้นต่ำ (บาท)" type="number" value={spendThreshold} onChange={setSpendThreshold} />
            <TextField label="ลด (บาท)" type="number" value={spendDiscountAmount} onChange={setSpendDiscountAmount} />
          </>
        )}
        <TextField label="วันเริ่ม" type="date" value={startAt} onChange={setStartAt} className="col-start-1" />
        <TextField label="วันสิ้นสุด" type="date" value={endAt} onChange={setEndAt} />

        <Field label="ช่องทาง (ไม่เลือก = ทุกช่องทาง)" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((ch) => (
              <button key={ch.value} type="button" className={chip(channels.includes(ch.value))} onClick={() => toggle(channels, setChannels, ch.value)}>
                {ch.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="สาขา (ไม่เลือก = ทุกสาขา)" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {branchesQuery.data?.items.map((b) => (
              <button key={b._id} type="button" className={chip(branchIds.includes(b._id))} onClick={() => toggle(branchIds, setBranchIds, b._id)}>
                {b.name}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex sm:col-span-2 items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" className="accent-primary-500" checked={stackable} onChange={(e) => setStackable(e.target.checked)} />
          ให้ซ้อนกับโปรโมชั่น/คูปองอื่นได้ (จำเป็นสำหรับผูกคูปอง)
        </label>
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

function CouponsPanel() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["coupons"], queryFn: () => apiFetch<{ items: Coupon[] }>("/coupons") });
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [deleting, setDeleting] = useState<Coupon | null>(null);

  const toggleMutation = useMutation({
    mutationFn: (c: Coupon) => apiFetch(`/coupons/${c._id}`, { method: "PATCH", body: { active: !c.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coupons"] }),
  });

  return (
    <>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + สร้างคูปอง
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>โค้ด</th>
              <th>โปรโมชั่น</th>
              <th className="text-right">ใช้ไปแล้ว</th>
              <th className="text-right">จำกัดต่อลูกค้า</th>
              <th>สถานะ</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.length === 0 && <EmptyRow colSpan={6} text="ยังไม่มีคูปอง" />}
            {query.data?.items.map((c) => (
              <tr key={c._id}>
                <td className="font-mono text-xs font-medium text-zinc-800">{c.code}</td>
                <td>{c.promotionId?.name ?? "-"}</td>
                <td className="text-right tabular-nums">
                  {c.usedCount}
                  {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                </td>
                <td className="text-right tabular-nums">{c.perCustomerLimit ?? "-"}</td>
                <td>
                  <ActiveBadge active={c.active} />
                </td>
                <td>
                  <div className="flex justify-end gap-3">
                    <button className="link" onClick={() => setEditing(c)}>
                      แก้ไข
                    </button>
                    <button className="link" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(c)}>
                      {c.active ? "ปิด" : "เปิด"}
                    </button>
                    <button className="link-danger" onClick={() => setDeleting(c)}>
                      ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <CouponFormModal
          coupon={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["coupons"] });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="ลบคูปอง"
          message={
            <>
              ต้องการลบคูปอง <b>{deleting.code}</b> ใช่หรือไม่? คูปองที่ถูกใช้แล้วจะลบไม่ได้
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/coupons/${deleting._id}`, { method: "DELETE" });
            qc.invalidateQueries({ queryKey: ["coupons"] });
          }}
        />
      )}
    </>
  );
}

function CouponFormModal({ coupon, onClose, onSaved }: { coupon: Coupon | null; onClose: () => void; onSaved: () => void }) {
  const promoQuery = useQuery({ queryKey: ["promotions"], queryFn: () => apiFetch<{ items: Promotion[] }>("/promotions") });
  const [code, setCode] = useState(coupon?.code ?? "");
  const [promotionId, setPromotionId] = useState(coupon?.promotionId?._id ?? "");
  const [usageLimit, setUsageLimit] = useState(coupon?.usageLimit !== undefined ? String(coupon.usageLimit) : "");
  const [perCustomerLimit, setPerCustomerLimit] = useState(coupon?.perCustomerLimit !== undefined ? String(coupon.perCustomerLimit) : "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        code,
        promotionId,
        usageLimit: usageLimit ? Number(usageLimit) : undefined,
        perCustomerLimit: perCustomerLimit ? Number(perCustomerLimit) : undefined,
      };
      return coupon ? apiFetch(`/coupons/${coupon._id}`, { method: "PATCH", body }) : apiFetch("/coupons", { method: "POST", body });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title={coupon ? "แก้ไขคูปอง" : "สร้างคูปอง"}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!code || !promotionId || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="โค้ดคูปอง" value={code} onChange={(v) => setCode(v.toUpperCase())} className="sm:col-span-2" />
        <Field label="ผูกกับโปรโมชั่น (ต้องตั้งให้ซ้อนได้)" className="sm:col-span-2">
          <select className="input" value={promotionId} onChange={(e) => setPromotionId(e.target.value)}>
            <option value="">เลือกโปรโมชั่น</option>
            {promoQuery.data?.items
              .filter((p) => p.stackable || p._id === promotionId)
              .map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <TextField label="จำกัดจำนวนครั้งทั้งหมด" type="number" value={usageLimit} onChange={setUsageLimit} placeholder="ไม่จำกัด" />
        <TextField label="จำกัดต่อลูกค้า" type="number" value={perCustomerLimit} onChange={setPerCustomerLimit} placeholder="ไม่จำกัด" />
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}
