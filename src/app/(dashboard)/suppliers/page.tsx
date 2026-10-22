"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { ActiveBadge, ConfirmDialog, EmptyRow, Field, Modal, PageHeader, TextField, errorMessage } from "@/components/ui";

interface Supplier {
  _id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
  notes?: string;
  active: boolean;
}

export default function SuppliersPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === "admin" || role === "branch_manager";
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  const query = useQuery({
    queryKey: ["suppliers", search],
    queryFn: () => apiFetch<{ items: Supplier[] }>("/suppliers", { query: { q: search } }),
  });

  const toggleMutation = useMutation({
    mutationFn: (s: Supplier) => apiFetch(`/suppliers/${s._id}`, { method: "PATCH", body: { active: !s.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });

  return (
    <>
      <PageHeader
        title="Supplier"
        description="รายชื่อผู้จำหน่ายสินค้า"
        actions={
          canWrite && (
            <button className="btn-primary" onClick={() => setEditing("new")}>
              + เพิ่ม Supplier
            </button>
          )
        }
      />

      <input className="input max-w-sm" placeholder="ค้นหาชื่อ / ผู้ติดต่อ / เบอร์โทร" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>ผู้ติดต่อ</th>
              <th>เบอร์โทร</th>
              <th>อีเมล</th>
              <th>สถานะ</th>
              {canWrite && <th className="text-right">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {query.data?.items.length === 0 && <EmptyRow colSpan={6} />}
            {query.data?.items.map((s) => (
              <tr key={s._id}>
                <td>
                  <span className="font-medium text-zinc-800">{s.name}</span>
                  {s.taxId && <p className="text-xs text-zinc-400">เลขผู้เสียภาษี {s.taxId}</p>}
                </td>
                <td>{s.contactName || "-"}</td>
                <td>{s.phone || "-"}</td>
                <td>{s.email || "-"}</td>
                <td>
                  <ActiveBadge active={s.active} />
                </td>
                {canWrite && (
                  <td>
                    <div className="flex justify-end gap-3">
                      <button className="link" onClick={() => setEditing(s)}>
                        แก้ไข
                      </button>
                      <button className="link" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(s)}>
                        {s.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </button>
                      {role === "admin" && (
                        <button className="link-danger" onClick={() => setDeleting(s)}>
                          ลบ
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <SupplierFormModal
          supplier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["suppliers"] });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="ลบ Supplier"
          message={
            <>
              ต้องการลบ <b>{deleting.name}</b> ใช่หรือไม่? หากมีใบรับสินค้าอ้างอิงอยู่จะลบไม่ได้ ให้ใช้ “ปิดใช้งาน” แทน
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/suppliers/${deleting._id}`, { method: "DELETE" });
            qc.invalidateQueries({ queryKey: ["suppliers"] });
          }}
        />
      )}
    </>
  );
}

function SupplierFormModal({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    contactName: supplier?.contactName ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    taxId: supplier?.taxId ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      supplier ? apiFetch(`/suppliers/${supplier._id}`, { method: "PATCH", body: form }) : apiFetch("/suppliers", { method: "POST", body: form }),
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title={supplier ? "แก้ไข Supplier" : "เพิ่ม Supplier"}
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
        <TextField label="ชื่อ Supplier" value={form.name} onChange={set("name")} className="sm:col-span-2" />
        <TextField label="ผู้ติดต่อ" value={form.contactName} onChange={set("contactName")} />
        <TextField label="เบอร์โทร" value={form.phone} onChange={set("phone")} />
        <TextField label="อีเมล" type="email" value={form.email} onChange={set("email")} />
        <TextField label="เลขประจำตัวผู้เสียภาษี" value={form.taxId} onChange={set("taxId")} />
        <TextField label="ที่อยู่" value={form.address} onChange={set("address")} className="sm:col-span-2" />
        <Field label="หมายเหตุ" className="sm:col-span-2">
          <textarea className="input min-h-20" value={form.notes} onChange={(e) => set("notes")(e.target.value)} />
        </Field>
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}
