"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/lib/authStore";
import type { Branch } from "@/lib/types";

export function BranchSelector() {
  const user = useAuthStore((s) => s.user);
  const selectedBranchId = useAuthStore((s) => s.selectedBranchId);
  const setSelectedBranchId = useAuthStore((s) => s.setSelectedBranchId);

  const { data } = useQuery({
    queryKey: ["branches"],
    queryFn: () => apiFetch<{ items: Branch[] }>("/branches"),
  });

  const branches = (data?.items ?? []).filter((b) => b.active).filter((b) => user?.role === "admin" || user?.branchIds.includes(b._id));

  if (branches.length === 0) return null;

  return (
    <select
      className="input input-sm w-auto min-w-44 py-1.5"
      value={selectedBranchId ?? (user?.role === "admin" ? "" : branches[0]?._id)}
      onChange={(e) => setSelectedBranchId(e.target.value || null)}
    >
      {user?.role === "admin" && <option value="">ทุกสาขา</option>}
      {branches.map((b) => (
        <option key={b._id} value={b._id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
