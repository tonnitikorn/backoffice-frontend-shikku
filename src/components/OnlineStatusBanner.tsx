"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Spec B12 (Phase 1 = level A+B): make the online/offline state unmissable
 * and never let the app pretend a write succeeded while offline. The banner
 * is the visible half; call sites (e.g. the POS confirm button) should also
 * gate submits on useIsOnline().
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // server render: assume online
  );
}

export function OnlineStatusBanner() {
  const online = useIsOnline();
  if (online) return null;

  return (
    <div className="bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-700">
      ขณะนี้อินเทอร์เน็ตหลุด — ดูข้อมูลที่แคชไว้ได้ แต่จะขายหรือบันทึกรายการใหม่ไม่ได้จนกว่าจะเชื่อมต่อได้อีกครั้ง
    </div>
  );
}
