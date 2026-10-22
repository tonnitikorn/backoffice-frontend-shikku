"use client";

import { useEffect, useState } from "react";
import { ApiClientError } from "@/lib/apiClient";

export function errorMessage(err: unknown, fallback = "เกิดข้อผิดพลาด"): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string }[] }) {
  return (
    <div className="tabs">
      {items.map((t) => (
        <button key={t.key} type="button" className={`tab ${value === t.key ? "tab-active" : ""}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <input type={type} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const width = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl", "2xl": "max-w-4xl" }[size];
  return (
    // Phones: a bottom sheet across the full width; larger screens: a centered dialog.
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/30 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={`flex max-h-[92dvh] w-full ${width} flex-col rounded-t-2xl bg-white shadow-xl shadow-zinc-900/5 sm:max-h-[90vh] sm:rounded-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          <h3 className="min-w-0 text-base font-semibold text-zinc-900">{title}</h3>
          <button type="button" className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" onClick={onClose} aria-label="ปิด">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-2 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:border-t-0 sm:px-6 sm:pb-5">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** Confirmation dialog for destructive actions; shows the server's error (e.g. "still in use") inline. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "ลบ",
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
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
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "กำลังดำเนินการ..." : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-zinc-600">{message}</div>
      {error && <p className="error-text mt-3">{error}</p>}
    </Modal>
  );
}

export function EmptyRow({ colSpan, text = "ยังไม่มีข้อมูล" }: { colSpan: number; text?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-sm text-zinc-400">
        {text}
      </td>
    </tr>
  );
}

export function ActiveBadge({ active, on = "เปิดใช้งาน", off = "ปิดใช้งาน" }: { active: boolean; on?: string; off?: string }) {
  return <span className={active ? "badge-primary" : "badge-muted"}>{active ? on : off}</span>;
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}
