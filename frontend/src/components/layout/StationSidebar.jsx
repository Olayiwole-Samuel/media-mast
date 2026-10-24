"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, CalendarDays, CalendarOff, Radio, LogOut, X, ArrowLeft, KeyRound, TrendingUp } from "lucide-react";
import { signOut } from "@/lib/auth";

// Station desk: station managers (their assigned stations) and full admins (every station).
const NAV_ITEMS = [
    { label: "Overview", href: "/station", icon: LayoutDashboard },
    { label: "Booking requests", href: "/station/requests", icon: Inbox },
    { label: "Schedule", href: "/station/schedule", icon: CalendarDays },
    { label: "Calendar", href: "/station/calendar", icon: CalendarOff },
    { label: "Rates & profile", href: "/station/profile", icon: Radio },
    { label: "Spend insights", href: "/station/insights", icon: TrendingUp },
    { label: "Change password", href: "/change-password", icon: KeyRound },
];

export default function StationSidebar({ user, mobileOpen = false, onMobileClose }) {
    const pathname = usePathname();
    const isActive = (href) => (href === "/station" ? pathname === "/station" : pathname?.startsWith(href));

    const nav = (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-5 py-5">
                <Link href="/station" className="flex items-center gap-2 font-bold text-slate-900 dark:text-white" onClick={onMobileClose}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
                        <Radio className="h-4 w-4" />
                    </span>
                    Station desk
                </Link>
                {onMobileClose && (
                    <button type="button" onClick={onMobileClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" aria-label="Close menu">
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>

            <nav className="flex-1 space-y-1 px-3" aria-label="Station desk">
                {user?.accountType === "ADMIN" && (
                    <Link href="/admin/dashboard" onClick={onMobileClose} className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to admin
                    </Link>
                )}
                {NAV_ITEMS.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={onMobileClose}
                            aria-current={active ? "page" : undefined}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                                active
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            }`}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{user?.name || "Station"}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
                <button type="button" onClick={signOut} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-red-600 dark:text-slate-300">
                    <LogOut className="h-4 w-4" /> Sign out
                </button>
            </div>
        </div>
    );

    return (
        <>
            <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
                <div className="sticky top-0 h-screen">{nav}</div>
            </aside>
            {mobileOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
                    <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl dark:bg-slate-900">{nav}</aside>
                </div>
            )}
        </>
    );
}
