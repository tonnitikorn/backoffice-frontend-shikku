"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { bahtToSatang, formatDate, formatMoney } from "@/lib/format";
import { ActiveBadge, ConfirmDialog, EmptyRow, Field, Modal, PageHeader, Tabs, TextField, errorMessage } from "@/components/ui";
import type { Customer, MemberLevel } from "@/lib/types";

type TabKey = "customers" | "levels";

export default function CustomersPage() {
  const role = useAuthStore((s) => s.user?.role);
  const [tab, setTab] = useState<TabKey>("customers");

  return (
    <>
      <PageHeader
        title="ลูกค้า / สมาชิก"
        description="ข้อมูลลูกค้า ยอดซื้อสะสม และระดับสมาชิก"
        actions={
          role === "admin" && (
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { key: "customers", label: "ลูกค้า" },
                { key: "levels", label: "ระดับสมาชิก" },
              ]}
            />
          )
        }
      />
      {tab === "customers" ? <CustomersPanel /> : <MemberLevelsPanel />}
    </>
  );
}

function levelName(c: Customer): string {
  return typeof c.memberLevelId === "object" && c.memberLevelId ? c.memberLevelId.name : "-";
}

function CustomersPanel() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canDelete = role === "admin" || role === "branch_manager";
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const query = useQuery({
    queryKey: ["customers", search],
    queryFn: () => apiFetch<{ items: Customer[] }>("/customers", { query: { q: search } }),
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input className="input max-w-sm" placeholder="ค้นหาชื่อ / เบอร์โทร / อีเมล" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + เพิ่มลูกค้า
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>เบอร์โทร</th>
              <th>ระดับสมาชิก</th>
              <th className="text-right">ยอดซื้อสะสม</th>
              <th className="text-right">คะแนน</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.length === 0 && <EmptyRow colSpan={6} text="ไม่พบลูกค้า" />}
            {query.data?.items.map((c) => (
              <tr key={c._id}>
                <td>
                  <span className="font-medium text-zinc-800">{c.name}</span>
                  {c.email && <p className="text-xs text-zinc-400">{c.email}</p>}
                </td>
                <td>{c.phone || "-"}</td>
                <td>{levelName(c) === "-" ? "-" : <span className="badge-primary">{levelName(c)}</span>}</td>
                <td className="text-right tabular-nums">฿{formatMoney(c.totalSpend)}</td>
                <td className="text-right tabular-nums">{c.points}</td>
                <td>
                  <div className="flex justify-end gap-3">
                    <button className="link" onClick={() => setEditing(c)}>
                      แก้ไข
                    </button>
                    {canDelete && (
                      <button className="link-danger" onClick={() => setDeleting(c)}>
                        ลบ
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <CustomerFormModal
          customer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["customers"] });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="ลบลูกค้า"
          message={
            <>
              ต้องการลบ <b>{deleting.name}</b> ใช่หรือไม่? ลูกค้าที่มีประวัติการซื้อแล้วจะลบไม่ได้
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/customers/${deleting._id}`, { method: "DELETE" });
            qc.invalidateQueries({ queryKey: ["customers"] });
          }}
        />
      )}
    </>
  );
}

function CustomerFormModal({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const levelsQuery = useQuery({ queryKey: ["member-levels"], queryFn: () => apiFetch<{ items: MemberLevel[] }>("/member-levels") });
  const initialLevel = typeof customer?.memberLevelId === "object" ? customer.memberLevelId?._id : customer?.memberLevelId;
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    address: customer?.address ?? "",
    birthday: customer?.birthday ? customer.birthday.slice(0, 10) : "",
    lineUserId: customer?.lineUserId ?? "",
    memberLevelId: initialLevel ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        birthday: form.birthday || undefined,
        memberLevelId: form.memberLevelId || (customer ? null : undefined),
      };
      return customer ? apiFetch(`/customers/${customer._id}`, { method: "PATCH", body }) : apiFetch("/customers", { method: "POST", body });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title={customer ? "แก้ไขข้อมูลลูกค้า" : "เพิ่มลูกค้า"}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!form.name || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="ชื่อ" value={form.name} onChange={set("name")} className="sm:col-span-2" />
        <TextField label="เบอร์โทร" value={form.phone} onChange={set("phone")} />
        <TextField label="อีเมล" type="email" value={form.email} onChange={set("email")} />
        <TextField label="วันเกิด" type="date" value={form.birthday} onChange={set("birthday")} />
        <TextField label="LINE User ID" value={form.lineUserId} onChange={set("lineUserId")} />
        <Field label="ระดับสมาชิก" className="sm:col-span-2">
          <select className="input" value={form.memberLevelId} onChange={(e) => set("memberLevelId")(e.target.value)}>
            <option value="">- ไม่มี -</option>
            {levelsQuery.data?.items
              .filter((l) => l.active || l._id === form.memberLevelId)
              .map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <TextField label="ที่อยู่" value={form.address} onChange={set("address")} className="sm:col-span-2" />
      </div>
      {customer && (
        <p className="mt-3 text-xs text-zinc-400">
          ยอดซื้อสะสม ฿{formatMoney(customer.totalSpend)} · คะแนน {customer.points} · สมัครเมื่อ {formatDate(customer.createdAt)}
        </p>
      )}
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

function MemberLevelsPanel() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["member-levels"], queryFn: () => apiFetch<{ items: MemberLevel[] }>("/member-levels") });
  const [editing, setEditing] = useState<MemberLevel | "new" | null>(null);
  const [deleting, setDeleting] = useState<MemberLevel | null>(null);

  const toggleMutation = useMutation({
    mutationFn: (l: MemberLevel) => apiFetch(`/member-levels/${l._id}`, { method: "PATCH", body: { active: !l.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-levels"] }),
  });

  return (
    <>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + เพิ่มระดับสมาชิก
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ชื่อระดับ</th>
              <th className="text-right">ยอดซื้อสะสมขั้นต่ำ</th>
              <th>สิทธิประโยชน์</th>
              <th>สถานะ</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.length === 0 && <EmptyRow colSpan={5} />}
            {query.data?.items.map((l) => (
              <tr key={l._id}>
                <td className="font-medium text-zinc-800">{l.name}</td>
                <td className="text-right tabular-nums">฿{formatMoney(l.thresholdSpend)}</td>
                <td className="max-w-xs truncate text-zinc-500">{l.benefitsDescription || "-"}</td>
                <td>
                  <ActiveBadge active={l.active} />
                </td>
                <td>
                  <div className="flex justify-end gap-3">
                    <button className="link" onClick={() => setEditing(l)}>
                      แก้ไข
                    </button>
                    <button className="link" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(l)}>
                      {l.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                    <button className="link-danger" onClick={() => setDeleting(l)}>
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
        <MemberLevelFormModal
          level={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["member-levels"] });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="ลบระดับสมาชิก"
          message={
            <>
              ต้องการลบระดับ <b>{deleting.name}</b> ใช่หรือไม่? หากมีลูกค้าหรือโปรโมชั่นใช้ระดับนี้อยู่จะลบไม่ได้
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/member-levels/${deleting._id}`, { method: "DELETE" });
            qc.invalidateQueries({ queryKey: ["member-levels"] });
          }}
        />
      )}
    </>
  );
}

function MemberLevelFormModal({ level, onClose, onSaved }: { level: MemberLevel | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(level?.name ?? "");
  const [threshold, setThreshold] = useState(level ? String(level.thresholdSpend / 100) : "0");
  const [benefits, setBenefits] = useState(level?.benefitsDescription ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name, thresholdSpend: bahtToSatang(Number(threshold) || 0), benefitsDescription: benefits };
      return level ? apiFetch(`/member-levels/${level._id}`, { method: "PATCH", body }) : apiFetch("/member-levels", { method: "POST", body });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title={level ? "แก้ไขระดับสมาชิก" : "เพิ่มระดับสมาชิก"}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!name || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="ชื่อระดับ" value={name} onChange={setName} placeholder="เช่น Silver, Gold" />
        <TextField label="ยอดซื้อสะสมขั้นต่ำ (บาท)" type="number" value={threshold} onChange={setThreshold} />
        <Field label="สิทธิประโยชน์">
          <textarea className="input min-h-20" value={benefits} onChange={(e) => setBenefits(e.target.value)} />
        </Field>
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}
