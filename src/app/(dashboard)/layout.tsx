"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuthHydrated, useAuthStore } from "@/lib/authStore";
import { BranchSelector } from "@/components/BranchSelector";
import { OnlineStatusBanner } from "@/components/OnlineStatusBanner";
import { NavIcon, type NavIconName } from "@/components/NavIcon";
import type { Role } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  roles?: Role[];
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "ภาพรวม",
    items: [
      { href: "/dashboard", label: "แดชบอร์ด", icon: "dashboard" },
      { href: "/reports", label: "รายงาน", icon: "reports" },
    ],
  },
  {
    title: "การขาย",
    items: [
      { href: "/pos", label: "ขายหน้าร้าน (POS)", icon: "pos" },
      { href: "/online-orders", label: "ออเดอร์ออนไลน์", icon: "online", roles: ["admin"] },
      { href: "/refunds", label: "คืนสินค้า", icon: "refund" },
      { href: "/promotions", label: "โปรโมชั่น", icon: "promotion", roles: ["admin"] },
      { href: "/customers", label: "ลูกค้า / สมาชิก", icon: "customers" },
    ],
  },
  {
    title: "สินค้าและสต๊อก",
    items: [
      { href: "/products", label: "สินค้า", icon: "products" },
      { href: "/stock", label: "สต๊อก", icon: "stock" },
      { href: "/transfers", label: "โอนสต๊อก", icon: "transfer", roles: ["admin", "branch_manager"] },
      { href: "/purchases", label: "รับสินค้า", icon: "purchase" },
      { href: "/suppliers", label: "Supplier", icon: "supplier" },
    ],
  },
  {
    title: "ร้านค้า",
    items: [
      { href: "/shifts", label: "กะและปิดยอด", icon: "shift" },
      { href: "/expenses", label: "ค่าใช้จ่าย", icon: "expense" },
      { href: "/audit-logs", label: "Audit Log", icon: "audit", roles: ["admin", "branch_manager"] },
      { href: "/settings", label: "ตั้งค่าระบบ", icon: "settings", roles: ["admin"] },
    ],
  },
];

const SIDEBAR_PREF_KEY = "sidebar-collapsed";

/** Tablets (iPad in any orientation) and narrower laptops start with the icon-only rail. */
const AUTO_COLLAPSE_QUERY = "(max-width: 1279px), (pointer: coarse)";

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function readCollapsedPref(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(SIDEBAR_PREF_KEY);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", branch_manager: "ผู้จัดการสาขา", staff: "พนักงาน" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, user, clear } = useAuthStore();
  const hydrated = useAuthHydrated();
  const [menuOpen, setMenuOpen] = useState(false);
  const autoCollapse = useMediaQuery(AUTO_COLLAPSE_QUERY);
  // Safe to read storage up front: nothing below renders until auth has hydrated on the client.
  const [collapsedPref, setCollapsedPref] = useState<boolean | null>(readCollapsedPref);
  const collapsed = collapsedPref ?? autoCollapse;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsedPref(next);
    try {
      localStorage.setItem(SIDEBAR_PREF_KEY, next ? "1" : "0");
    } catch {
      // per-device convenience only
    }
  }

  useEffect(() => {
    if (hydrated && !accessToken) router.replace("/login");
  }, [hydrated, accessToken, router]);

  if (!hydrated) {
    return <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">กำลังโหลด...</div>;
  }
  if (!accessToken || !user) return null;

  const visibleGroups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => !item.roles || item.roles.includes(user.role)) })).filter((g) => g.items.length > 0);
  const isActive = (href: string) => pathname === href || Boolean(pathname?.startsWith(href + "/"));

  const logout = () => {
    clear();
    router.push("/login");
  };

  /** `rail` = icon-only sidebar; the mobile drawer always renders expanded. */
  const renderSidebar = (rail: boolean) => (
    <aside className={`flex h-full flex-col border-r border-zinc-200/80 bg-white transition-[width] duration-200 ${rail ? "w-[76px]" : "w-64"}`}>
      <div className={`flex items-center ${rail ? "justify-center px-2 py-4" : "justify-between gap-2 px-5 py-4"}`}>
        {rail ? (
          // eslint-disable-next-line @next/next/no-img-element -- static brand logo
          <img src="/logo-mark.png" alt="ShikkuLens" className="h-9 w-auto" />
        ) : (
          <div className="flex flex-col items-start gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand logo */}
            <img src="/logo.png" alt="ShikkuLens" className="h-12 w-auto" />
            <p className="text-[11px] text-zinc-400">Backoffice & POS</p>
          </div>
        )}
        {menuOpen && !rail && (
          <button className="btn-ghost px-2 sm:hidden" onClick={() => setMenuOpen(false)} aria-label="ปิดเมนู">
            <NavIcon name="close" />
          </button>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto pb-4 ${rail ? "px-2" : "px-3"}`}>
        {visibleGroups.map((group) => (
          <div key={group.title} className={rail ? "mt-2 border-t border-zinc-100 pt-2 first:mt-0 first:border-t-0 first:pt-0" : "mt-5 first:mt-0"}>
            {!rail && <p className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-zinc-400">{group.title}</p>}
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={rail ? item.label : undefined}
                  aria-label={rail ? item.label : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`relative mb-1 flex items-center rounded-xl transition-colors ${
                    rail ? "h-12 justify-center" : "gap-3 px-3 py-2.5 text-[15px]"
                  } ${active ? "bg-primary-100 font-semibold text-primary-900" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"}`}
                >
                  {active && <span className="absolute top-2.5 bottom-2.5 left-0 w-1 rounded-full bg-primary-500" />}
                  <NavIcon name={item.icon} className={rail ? "h-6 w-6" : "h-5 w-5"} />
                  {!rail && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={`border-t border-zinc-100 ${rail ? "flex flex-col items-center gap-1 p-2" : "p-3"}`}>
        {rail ? (
          <span title={`${user.name} · ${ROLE_LABEL[user.role]}`} className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-800">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <div className="mb-2 flex items-center gap-2.5 px-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-800">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-800">{user.name}</p>
              <p className="text-xs text-zinc-400">{ROLE_LABEL[user.role]}</p>
            </div>
          </div>
        )}
        <button onClick={logout} title={rail ? "ออกจากระบบ" : undefined} aria-label="ออกจากระบบ" className={`btn-ghost ${rail ? "h-11 w-11 px-0" : "w-full justify-start gap-3"}`}>
          <NavIcon name="logout" />
          {!rail && "ออกจากระบบ"}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      <div className="sticky top-0 hidden h-screen sm:block">{renderSidebar(collapsed)}</div>
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex sm:hidden">
          <div className="h-full shadow-xl">{renderSidebar(false)}</div>
          <div className="flex-1 bg-zinc-900/30" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <OnlineStatusBanner />
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-zinc-200/80 bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button className="btn-ghost px-2 sm:hidden" onClick={() => setMenuOpen(true)} aria-label="เมนู">
              <NavIcon name="menu" />
            </button>
            <button
              className="btn-ghost hidden px-2 sm:inline-flex"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
              title={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
            >
              <NavIcon name={collapsed ? "expand" : "collapse"} />
            </button>
            <BranchSelector />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="badge-muted hidden md:inline-flex">{ROLE_LABEL[user.role]}</span>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
