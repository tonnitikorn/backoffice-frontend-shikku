import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, PermissionMap } from './types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  permissions: PermissionMap;
  selectedBranchId: string | null;
  setAuth: (data: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  setPermissions: (permissions: PermissionMap) => void;
  setSelectedBranchId: (branchId: string | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      permissions: {},
      selectedBranchId: null,
      setAuth: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
      setPermissions: (permissions) => set({ permissions }),
      setSelectedBranchId: (branchId) => set({ selectedBranchId: branchId }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null, permissions: {} }),
    }),
    { name: 'shikkulens-auth' },
  ),
);

export function hasPermission(permissions: PermissionMap, key: string): boolean {
  const value = permissions[key];
  return value === true || (typeof value === 'number' && value > 0);
}

/**
 * True once the persisted auth state has been read from localStorage. During
 * server render and the first (hydration) client render the store still holds
 * its empty initial state, so auth redirects must wait for this — otherwise a
 * page reload looks like "not logged in" and bounces to /login.
 */
export function useAuthHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useAuthStore.persist.onFinishHydration(onChange),
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  );
}
