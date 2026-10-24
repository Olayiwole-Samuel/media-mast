"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import NotificationBell from "@/components/layout/NotificationBell";
import CompanySidebar from "@/components/layout/CompanySidebar";
import { useAuthGuard, isCompanyOwner } from "@/lib/auth";

// The company owner (COMPANY account) and company employees (EMPLOYEE
// accounts). Each section still depends on backend permissions.
const ALLOWED = ["COMPANY", "EMPLOYEE"];

export default function CompanyLayout({ children }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { user, allowed } = useAuthGuard(ALLOWED);

    if (!allowed) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500 dark:border-slate-800 dark:border-t-emerald-400" />
                    <p className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
                        Loading company workspace…
                    </p>
                </div>
            </div>
        );
    }

    const userInitial = user?.name?.charAt(0)?.toUpperCase() || "U";

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
            <CompanySidebar
                isOpen={!isCollapsed}
                onToggle={setIsCollapsed}
                mobileOpen={mobileOpen}
                onMobileClose={() => setMobileOpen(false)}
                user={user}
            />

            <div
                className={`
                    flex min-h-screen min-w-0 flex-1 flex-col
                    transition-[margin] duration-300 ease-[cubic-bezier(0.21,0.47,0.32,0.98)]
                    ${isCollapsed ? "lg:ml-[80px]" : "lg:ml-[260px]"}
                `}
            >
                {/* Top Bar */}
                <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80 lg:px-6">
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 lg:hidden dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        aria-label="Open navigation"
                    >
                        <Menu className="h-5 w-5" strokeWidth={2} />
                    </button>

                    <div className="flex-1" />

                    <NotificationBell />

                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="hidden text-right sm:block">
                                <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
                                    {user?.name}
                                </p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                    {isCompanyOwner(user) ? "Company owner" : "Team member"}
                                </p>
                            </div>
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-[12px] font-semibold text-white shadow-sm shadow-emerald-500/20">
                                {userInitial}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
