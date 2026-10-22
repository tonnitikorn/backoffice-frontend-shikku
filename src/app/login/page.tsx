"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/apiClient";
import { useAuthHydrated, useAuthStore } from "@/lib/authStore";
import type { AuthUser, PermissionMap } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hydrated = useAuthHydrated();
  const alreadyLoggedIn = useAuthStore((s) => Boolean(s.accessToken && s.user));

  useEffect(() => {
    if (hydrated && alreadyLoggedIn) router.replace("/dashboard");
  }, [hydrated, alreadyLoggedIn, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ accessToken: string; refreshToken: string; user: AuthUser }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setAuth(data);
      const me = await apiFetch<{ permissions: PermissionMap }>("/auth/me");
      setPermissions(me.permissions);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand logo */}
          <img src="/logo.png" alt="" className="mb-3 h-28 w-auto" />
          <h1 className="sr-only">ShikkuLens</h1>
          <p className="mt-1 text-sm text-zinc-500">เข้าสู่ระบบเพื่อจัดการร้านคอนแทคเลนส์</p>
        </div>

        <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-6">
          <div>
            <label className="label">อีเมล</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="admin@shikkulens.local"
            />
          </div>
          <div>
            <label className="label">รหัสผ่าน</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary mt-1 w-full py-2.5">
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}
