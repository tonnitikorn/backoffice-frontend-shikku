"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { ActiveBadge, ConfirmDialog, EmptyRow, Field, Modal, PageHeader, Tabs, TextField, errorMessage } from "@/components/ui";
import type { Branch, Role } from "@/lib/types";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  branchIds: string[];
  active: boolean;
}

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", branch_manager: "ผู้จัดการสาขา", staff: "พนักงาน" };

type TabKey = "defaults" | "branches" | "users" | "stock-groups";

export default function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("branches");

  return (
    <>
      <PageHeader
        title="ตั้งค่าระบบ"
        description="จัดการสาขา ผู้ใช้งาน และค่าตั้งต้นของระบบ"
        actions={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { key: "branches", label: "สาขา" },
              { key: "users", label: "ผู้ใช้งาน" },
              { key: "stock-groups", label: "กลุ่มนับสต๊อก" },
              { key: "defaults", label: "ค่าตั้งต้น" },
            ]}
          />
        }
      />

      {tab === "defaults" && <DefaultsPanel />}
      {tab === "branches" && <BranchesPanel />}
      {tab === "users" && <UsersPanel />}
      {tab === "stock-groups" && <StockGroupsPanel />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

const SETTING_LABEL: Record<string, string> = {
  refund_policy: "นโยบายรับคืน",
  stock_channel_default_mode: "โหมด Stock หน้าร้าน/Online เริ่มต้น",
  low_stock_default_threshold: "จุดแจ้งเตือนสต๊อกต่ำ (เริ่มต้น)",
  expiry_warning_days: "แจ้งเตือนสินค้าใกล้หมดอายุ (วัน)",
  dead_stock_days: "สินค้าค้างสต๊อกไม่มีขาย (วัน)",
  transfer_overdue_days: "แจ้งเตือนโอนสต๊อกค้างรับ (วัน)",
  sku_generation_cap: "เพดานจำนวน SKU ต่อการสร้าง 1 ครั้ง",
  sku_code_format: "รูปแบบรหัส SKU",
  promotion_stacking_mode: "โหมดโปรโมชั่นซ้อนกัน",
  purchase_allocation_method: "วิธีกระจายส่วนลด/ค่าขนส่งใน Purchase",
};

function toInputValue(value: unknown): string {
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
}

function parseInputValue(raw: string, original: unknown): unknown {
  if (typeof original === "number") {
    const n = Number(raw);
    if (Number.isNaN(n)) throw new Error("ต้องเป็นตัวเลข");
    return n;
  }
  if (typeof original === "object" && original !== null) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("รูปแบบ JSON ไม่ถูกต้อง");
    }
  }
  return raw;
}

function DefaultsPanel() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["settings"], queryFn: () => apiFetch<{ settings: Record<string, unknown> }>("/settings") });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, { ok: boolean; text: string }>>({});

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => apiFetch(`/settings/${key}`, { method: "PUT", body: { value } }),
    onSuccess: (_d, { key }) => {
      setStatus((s) => ({ ...s, [key]: { ok: true, text: "บันทึกแล้ว" } }));
      setEdits((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err, { key }) => setStatus((s) => ({ ...s, [key]: { ok: false, text: errorMessage(err) } })),
  });

  if (!query.data) return <p className="text-sm text-zinc-400">กำลังโหลด...</p>;

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>รายการ</th>
            <th>ค่าปัจจุบัน</th>
            <th className="w-40"></th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(query.data.settings)
            .filter(([key]) => SETTING_LABEL[key])
            .map(([key, value]) => {
              const dirty = edits[key] !== undefined && edits[key] !== toInputValue(value);
              return (
                <tr key={key}>
                  <td className="font-medium text-zinc-800">{SETTING_LABEL[key]}</td>
                  <td>
                    <input
                      className="input input-sm max-w-xs"
                      value={edits[key] ?? toInputValue(value)}
                      onChange={(e) => {
                        setEdits((prev) => ({ ...prev, [key]: e.target.value }));
                        setStatus((s) => ({ ...s, [key]: { ok: true, text: "" } }));
                      }}
                    />
                  </td>
                  <td className="text-right">
                    {status[key]?.text && <span className={`mr-3 text-xs ${status[key].ok ? "text-primary-700" : "text-red-500"}`}>{status[key].text}</span>}
                    <button
                      className="btn-secondary btn-sm"
                      disabled={!dirty || saveMutation.isPending}
                      onClick={() => {
                        try {
                          saveMutation.mutate({ key, value: parseInputValue(edits[key], value) });
                        } catch (err) {
                          setStatus((s) => ({ ...s, [key]: { ok: false, text: (err as Error).message } }));
                        }
                      }}
                    >
                      บันทึก
                    </button>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Branches                                                            */
/* ------------------------------------------------------------------ */

function BranchesPanel() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["branches"], queryFn: () => apiFetch<{ items: Branch[] }>("/branches") });
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);

  const toggleMutation = useMutation({
    mutationFn: (b: Branch) => apiFetch(`/branches/${b._id}`, { method: "PATCH", body: { active: !b.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + เพิ่มสาขา
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อสาขา</th>
              <th>เบอร์โทร</th>
              <th>สถานะ</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.length === 0 && <EmptyRow colSpan={5} text="ยังไม่มีสาขา" />}
            {query.data?.items.map((b) => (
              <tr key={b._id}>
                <td className="font-mono text-xs text-zinc-500">{b.code}</td>
                <td>
                  <span className="font-medium text-zinc-800">{b.name}</span>
                  {b.isDefaultOnlineBranch && <span className="badge-primary ml-2">สาขาหลัก Online</span>}
                  {b.address && <p className="text-xs text-zinc-400">{b.address}</p>}
                </td>
                <td>{b.phone || "-"}</td>
                <td>
                  <ActiveBadge active={b.active} />
                </td>
                <td>
                  <div className="flex justify-end gap-3">
                    <button className="link" onClick={() => setEditing(b)}>
                      แก้ไข
                    </button>
                    <button className="link" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(b)}>
                      {b.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                    <button className="link-danger" onClick={() => setDeleting(b)}>
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
        <BranchFormModal
          branch={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["branches"] });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="ลบสาขา"
          message={
            <>
              ต้องการลบสาขา <b>{deleting.name}</b> ใช่หรือไม่? หากสาขานี้มีข้อมูลการขายหรือสต๊อกแล้ว ระบบจะไม่อนุญาตให้ลบ ให้ใช้ “ปิดใช้งาน” แทน
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/branches/${deleting._id}`, { method: "DELETE" });
            qc.invalidateQueries({ queryKey: ["branches"] });
          }}
        />
      )}
    </div>
  );
}

function BranchFormModal({ branch, onClose, onSaved }: { branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(branch?.code ?? "");
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [active, setActive] = useState(branch?.active ?? true);
  const [isDefaultOnlineBranch, setIsDefaultOnlineBranch] = useState(branch?.isDefaultOnlineBranch ?? false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const body = { code, name, address, phone, active, isDefaultOnlineBranch };
      return branch ? apiFetch(`/branches/${branch._id}`, { method: "PATCH", body }) : apiFetch("/branches", { method: "POST", body });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title={branch ? "แก้ไขสาขา" : "เพิ่มสาขา"}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!code || !name || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="รหัสสาขา" value={code} onChange={setCode} placeholder="เช่น BKK01" />
        <TextField label="เบอร์โทร" value={phone} onChange={setPhone} />
        <TextField label="ชื่อสาขา" value={name} onChange={setName} className="sm:col-span-2" />
        <TextField label="ที่อยู่" value={address} onChange={setAddress} className="sm:col-span-2" />
        <label className="flex sm:col-span-2 items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" className="accent-primary-500" checked={active} onChange={(e) => setActive(e.target.checked)} />
          เปิดใช้งานสาขานี้
        </label>
        <label className="flex sm:col-span-2 items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" className="accent-primary-500" checked={isDefaultOnlineBranch} onChange={(e) => setIsDefaultOnlineBranch(e.target.checked)} />
          ใช้เป็นสาขาหลักสำหรับออเดอร์ออนไลน์
        </label>
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

function UsersPanel() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiFetch<{ items: Branch[] }>("/branches") });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: () => apiFetch<{ items: UserRow[] }>("/users") });
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);

  const branchName = (id: string) => branchesQuery.data?.items.find((b) => b._id === id)?.name ?? "-";

  const toggleMutation = useMutation({
    mutationFn: (u: UserRow) => apiFetch(`/users/${u.id}`, { method: "PATCH", body: { active: !u.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + เพิ่มผู้ใช้งาน
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>อีเมล</th>
              <th>บทบาท</th>
              <th>สาขา</th>
              <th>สถานะ</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.data?.items.length === 0 && <EmptyRow colSpan={6} />}
            {usersQuery.data?.items.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <td className="font-medium text-zinc-800">
                    {u.name}
                    {isMe && <span className="badge-muted ml-2">คุณ</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td className="text-xs">{u.role === "admin" ? "ทุกสาขา" : u.branchIds.map(branchName).join(", ") || "-"}</td>
                  <td>
                    <ActiveBadge active={u.active} on="ใช้งาน" off="ระงับ" />
                  </td>
                  <td>
                    <div className="flex justify-end gap-3">
                      <button className="link" onClick={() => setEditing(u)}>
                        แก้ไข
                      </button>
                      {!isMe && (
                        <>
                          <button className="link" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(u)}>
                            {u.active ? "ระงับ" : "เปิดใช้งาน"}
                          </button>
                          <button className="link-danger" onClick={() => setDeleting(u)}>
                            ลบ
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <UserFormModal
          user={editing === "new" ? null : editing}
          branches={branchesQuery.data?.items ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["users"] });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="ลบผู้ใช้งาน"
          message={
            <>
              ต้องการลบ <b>{deleting.name}</b> ใช่หรือไม่? หากผู้ใช้นี้เคยทำรายการในระบบแล้ว จะลบไม่ได้ ให้ใช้ “ระงับ” แทน
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/users/${deleting.id}`, { method: "DELETE" });
            qc.invalidateQueries({ queryKey: ["users"] });
          }}
        />
      )}
    </div>
  );
}

function UserFormModal({ user, branches, onClose, onSaved }: { user: UserRow | null; branches: Branch[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "staff");
  const [branchIds, setBranchIds] = useState<string[]>(user?.branchIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const passwordOk = user ? password.length === 0 || password.length >= 8 : password.length >= 8;

  const mutation = useMutation({
    mutationFn: () => {
      if (user) {
        return apiFetch(`/users/${user.id}`, {
          method: "PATCH",
          body: { name, role, branchIds, ...(password ? { password } : {}) },
        });
      }
      return apiFetch("/users", { method: "POST", body: { name, email, password, role, branchIds } });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title={user ? "แก้ไขผู้ใช้งาน" : "เพิ่มผู้ใช้งาน"}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!name || !email || !passwordOk || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="ชื่อ" value={name} onChange={setName} className="sm:col-span-2" />
        <Field label="อีเมล" className="sm:col-span-2">
          <input type="email" className="input" value={email} disabled={Boolean(user)} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={user ? "รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" : "รหัสผ่าน (อย่างน้อย 8 ตัว)"} className="sm:col-span-2">
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="บทบาท" className="sm:col-span-2">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="staff">พนักงาน</option>
            <option value="branch_manager">ผู้จัดการสาขา</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        {role !== "admin" && (
          <Field label="สาขาที่เข้าถึงได้" className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => {
                const checked = branchIds.includes(b._id);
                return (
                  <label
                    key={b._id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${
                      checked ? "border-primary-300 bg-primary-50 text-primary-800" : "border-zinc-200 text-zinc-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary-500"
                      checked={checked}
                      onChange={(e) => setBranchIds((prev) => (e.target.checked ? [...prev, b._id] : prev.filter((id) => id !== b._id)))}
                    />
                    {b.name}
                  </label>
                );
              })}
            </div>
          </Field>
        )}
      </div>
      {user && <p className="mt-3 text-xs text-zinc-400">การเปลี่ยนบทบาทหรือสาขาจะทำให้ผู้ใช้ต้องเข้าสู่ระบบใหม่</p>}
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Stock count groups (the per-shift stock sheet)                      */
/* ------------------------------------------------------------------ */

interface StockGroup {
  _id: string;
  name: string;
  sortOrder: number;
  productIds: string[];
  powerFilter: "any" | "plano" | "non_plano";
  unitLabel: string;
  active: boolean;
}
interface ProductOption {
  _id: string;
  name: string;
  type: string;
  defaultPriceRegular: number;
}

const POWER_LABEL: Record<StockGroup["powerFilter"], string> = { any: "ทุกค่าสายตา", plano: "เฉพาะสายตาปกติ (0.00)", non_plano: "เฉพาะมีค่าสายตา" };

function StockGroupsPanel() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["stock-count-groups"], queryFn: () => apiFetch<{ items: StockGroup[] }>("/stock-count-groups") });
  const ungroupedQuery = useQuery({
    queryKey: ["stock-count-groups", "ungrouped"],
    queryFn: () => apiFetch<{ items: ProductOption[] }>("/stock-count-groups/ungrouped-products"),
  });
  const [editing, setEditing] = useState<StockGroup | "new" | null>(null);
  const [deleting, setDeleting] = useState<StockGroup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["stock-count-groups"] });
  const bootstrapMutation = useMutation({
    mutationFn: () => apiFetch("/stock-count-groups/bootstrap", { method: "POST" }),
    onSuccess: refresh,
    onError: (err) => setError(errorMessage(err)),
  });
  const toggleMutation = useMutation({
    mutationFn: (g: StockGroup) => apiFetch(`/stock-count-groups/${g._id}`, { method: "PATCH", body: { active: !g.active } }),
    onSuccess: refresh,
  });

  const groups = query.data?.items ?? [];
  const ungrouped = ungroupedQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">
        รายการในใบนับ “Stock ก่อนขาย / หลังขาย” ที่พนักงานนับทุกกะ — เมื่อมีกลุ่มแล้ว ต้องนับหลังขายก่อนถึงจะปิดกะได้
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {!query.isLoading && groups.length === 0 && (
          <button className="btn-secondary" disabled={bootstrapMutation.isPending} onClick={() => bootstrapMutation.mutate()}>
            สร้างกลุ่มเริ่มต้นจากสินค้าที่มี
          </button>
        )}
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + เพิ่มกลุ่ม
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {groups.length > 0 && ungrouped.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          สินค้าที่ยังไม่อยู่ในกลุ่มใด ({ungrouped.length}): {ungrouped.slice(0, 12).map((p) => p.name).join(", ")}
          {ungrouped.length > 12 ? " …" : ""}
        </p>
      )}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-16">ลำดับ</th>
              <th>ชื่อกลุ่ม</th>
              <th>ค่าสายตา</th>
              <th className="text-right">สินค้า</th>
              <th>หน่วย</th>
              <th>สถานะ</th>
              <th className="text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && <EmptyRow colSpan={7} text="ยังไม่มีกลุ่ม — กด “สร้างกลุ่มเริ่มต้นจากสินค้าที่มี” เพื่อเริ่มจากใบนับแบบร้าน" />}
            {groups.map((g) => (
              <tr key={g._id}>
                <td className="tabular-nums text-zinc-400">{g.sortOrder}</td>
                <td className="font-medium text-zinc-800">{g.name}</td>
                <td>{POWER_LABEL[g.powerFilter]}</td>
                <td className="text-right tabular-nums">{g.productIds.length}</td>
                <td>{g.unitLabel}</td>
                <td>
                  <ActiveBadge active={g.active} />
                </td>
                <td>
                  <div className="flex justify-end gap-3">
                    <button className="link" onClick={() => setEditing(g)}>
                      แก้ไข
                    </button>
                    <button className="link" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(g)}>
                      {g.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                    <button className="link-danger" onClick={() => setDeleting(g)}>
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
        <StockGroupFormModal
          group={editing === "new" ? null : editing}
          nextSortOrder={(groups.at(-1)?.sortOrder ?? 0) + 10}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="ลบกลุ่มนับสต๊อก"
          message={
            <>
              ต้องการลบกลุ่ม <b>{deleting.name}</b> ใช่หรือไม่? ผลนับของกะที่ผ่านมายังเก็บไว้ตามเดิม
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/stock-count-groups/${deleting._id}`, { method: "DELETE" });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function StockGroupFormModal({ group, nextSortOrder, onClose, onSaved }: { group: StockGroup | null; nextSortOrder: number; onClose: () => void; onSaved: () => void }) {
  const productsQuery = useQuery({ queryKey: ["products", "all-active"], queryFn: () => apiFetch<{ items: ProductOption[] }>("/products", { query: { active: "true" } }) });
  const [name, setName] = useState(group?.name ?? "");
  const [sortOrder, setSortOrder] = useState(String(group?.sortOrder ?? nextSortOrder));
  const [powerFilter, setPowerFilter] = useState<StockGroup["powerFilter"]>(group?.powerFilter ?? "any");
  const [unitLabel, setUnitLabel] = useState(group?.unitLabel ?? "คู่");
  const [selected, setSelected] = useState<Set<string>>(new Set(group?.productIds ?? []));
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const products = (productsQuery.data?.items ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "th"));
  const visible = products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name, sortOrder: Number(sortOrder) || 0, powerFilter, unitLabel, productIds: [...selected] };
      return group ? apiFetch(`/stock-count-groups/${group._id}`, { method: "PATCH", body }) : apiFetch("/stock-count-groups", { method: "POST", body });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal
      title={group ? "แก้ไขกลุ่มนับสต๊อก" : "เพิ่มกลุ่มนับสต๊อก"}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!name || selected.size === 0 || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <TextField label="ชื่อกลุ่ม (เช่น สายตาปกติ 99฿)" value={name} onChange={setName} className="sm:col-span-2" />
          <TextField label="ลำดับในใบนับ" type="number" value={sortOrder} onChange={setSortOrder} />
          <TextField label="หน่วย" value={unitLabel} onChange={setUnitLabel} />
        </div>
        <Field label="ค่าสายตาที่นับรวมในกลุ่มนี้">
          <select className="input" value={powerFilter} onChange={(e) => setPowerFilter(e.target.value as StockGroup["powerFilter"])}>
            {Object.entries(POWER_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`สินค้าในกลุ่ม (${selected.size} รายการ)`}>
          <div className="mb-2 flex gap-2">
            <input className="input flex-1" placeholder="ค้นหาสินค้า" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="button" className="btn-secondary" onClick={() => setSelected((prev) => new Set([...prev, ...visible.map((p) => p._id)]))}>
              เลือกทั้งหมดที่เห็น
            </button>
            <button type="button" className="btn-ghost" onClick={() => setSelected((prev) => new Set([...prev].filter((id) => !visible.some((p) => p._id === id))))}>
              ล้าง
            </button>
          </div>
          <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-zinc-100 p-2 sm:grid-cols-2">
            {visible.map((p) => (
              <label key={p._id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-zinc-50">
                <input type="checkbox" checked={selected.has(p._id)} onChange={() => toggle(p._id)} />
                <span className="flex-1">{p.name}</span>
                <span className="text-xs text-zinc-400">฿{(p.defaultPriceRegular / 100).toLocaleString()}</span>
              </label>
            ))}
          </div>
        </Field>
        {error && <p className="error-text">{error}</p>}
      </div>
    </Modal>
  );
}
