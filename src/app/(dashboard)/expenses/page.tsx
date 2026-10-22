"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import { useEffectiveBranchId } from "@/lib/useEffectiveBranch";
import { bahtToSatang, formatDate, formatMoney } from "@/lib/format";
import { ConfirmDialog, EmptyRow, Field, Modal, Notice, PageHeader, TextField, errorMessage } from "@/components/ui";

const CATEGORIES = ["rent", "electricity", "water", "shipping", "packaging", "advertising", "other"] as const;
type ExpenseCategory = (typeof CATEGORIES)[number];
const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  rent: "ค่าเช่า",
  electricity: "ค่าไฟ",
  water: "ค่าน้ำ",
  shipping: "ค่าขนส่ง",
  packaging: "ค่ากล่อง/แพ็กสินค้า",
  advertising: "ค่าโฆษณา",
  other: "อื่นๆ",
};

interface Expense {
  _id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  vat?: number;
  linkedCashMovementId?: string;
}

export default function ExpensesPage() {
  const branchId = useEffectiveBranchId();
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === "admin" || role === "branch_manager";
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const query = useQuery({
    queryKey: ["expenses", branchId, category],
    queryFn: () => apiFetch<{ items: Expense[] }>("/expenses", { query: { branchId, category } }),
    enabled: Boolean(branchId),
  });

  if (!branchId) return <Notice>กรุณาเลือกสาขาจากแถบด้านบน</Notice>;

  const total = (query.data?.items ?? []).reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageHeader
        title="ค่าใช้จ่าย"
        description="บันทึกค่าใช้จ่ายของสาขา"
        actions={
          canWrite && (
            <button className="btn-primary" onClick={() => setEditing("new")}>
              + บันทึกค่าใช้จ่าย
            </button>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">ทุกประเภท</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <p className="text-sm text-zinc-500">
          รวม <span className="font-semibold text-zinc-900 tabular-nums">฿{formatMoney(total)}</span>
        </p>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>ประเภท</th>
              <th>รายละเอียด</th>
              <th className="text-right">จำนวนเงิน</th>
              {canWrite && <th className="text-right">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {query.data?.items.length === 0 && <EmptyRow colSpan={5} />}
            {query.data?.items.map((e) => (
              <tr key={e._id}>
                <td className="whitespace-nowrap">{formatDate(e.date)}</td>
                <td>
                  <span className="badge-muted">{CATEGORY_LABEL[e.category] ?? e.category}</span>
                </td>
                <td>
                  {e.description}
                  {e.linkedCashMovementId && <span className="badge-warn ml-2">เบิกจากกะ</span>}
                </td>
                <td className="text-right tabular-nums">฿{formatMoney(e.amount)}</td>
                {canWrite && (
                  <td>
                    <div className="flex justify-end gap-3">
                      <button className="link" onClick={() => setEditing(e)}>
                        แก้ไข
                      </button>
                      <button className="link-danger" onClick={() => setDeleting(e)}>
                        ลบ
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ExpenseFormModal
          branchId={branchId}
          expense={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["expenses", branchId] });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="ลบค่าใช้จ่าย"
          message={
            <>
              ต้องการลบรายการ <b>{deleting.description}</b> (฿{formatMoney(deleting.amount)}) ใช่หรือไม่?
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await apiFetch(`/expenses/${deleting._id}`, { method: "DELETE" });
            qc.invalidateQueries({ queryKey: ["expenses", branchId] });
          }}
        />
      )}
    </>
  );
}

function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function ExpenseFormModal({
  branchId,
  expense,
  onClose,
  onSaved,
}: {
  branchId: string;
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(expense ? expense.date.slice(0, 10) : todayIso());
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? "other");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount / 100) : "");
  const [vat, setVat] = useState(expense?.vat ? String(expense.vat / 100) : "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        date: new Date(date).toISOString(),
        category,
        description,
        amount: bahtToSatang(Number(amount)),
        vat: vat ? bahtToSatang(Number(vat)) : 0,
      };
      return expense
        ? apiFetch(`/expenses/${expense._id}`, { method: "PATCH", body })
        : apiFetch("/expenses", { method: "POST", body: { ...body, branchId } });
    },
    onSuccess: onSaved,
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      title={expense ? "แก้ไขค่าใช้จ่าย" : "บันทึกค่าใช้จ่าย"}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary" disabled={!description || !(Number(amount) > 0) || !date || mutation.isPending} onClick={() => mutation.mutate()}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="วันที่" type="date" value={date} onChange={setDate} />
        <Field label="ประเภท">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <TextField label="รายละเอียด" value={description} onChange={setDescription} className="sm:col-span-2" />
        <TextField label="จำนวนเงิน (บาท)" type="number" value={amount} onChange={setAmount} />
        <TextField label="VAT (บาท)" type="number" value={vat} onChange={setVat} />
      </div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}
