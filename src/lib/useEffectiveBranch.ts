"use client";

import { useAuthStore } from "./authStore";

/** The branch the current screen should operate against: the picked branch selector value, or the user's own (first) branch for non-admins. */
export function useEffectiveBranchId(): string | undefined {
  const user = useAuthStore((s) => s.user);
  const selectedBranchId = useAuthStore((s) => s.selectedBranchId);
  if (selectedBranchId) return selectedBranchId;
  if (user && user.role !== "admin") return user.branchIds[0];
  return undefined;
}
