"use client";

import { useAuthStore } from "@/lib/authStore";
import type { Role } from "@/lib/types";

export function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (!role || !roles.includes(role)) return null;
  return <>{children}</>;
}
