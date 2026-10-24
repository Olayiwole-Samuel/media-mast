"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import NotificationBell from "@/components/layout/NotificationBell";
import StationSidebar from "@/components/layout/StationSidebar";
import { useAuthGuard } from "@/lib/auth";
import { PageLoading } from "@/components/common/PageState";

// Station managers (STATION accounts created by admins) and full admins,
// who see every station. The backend checks every request again.
const ALLOWED = ["STATION", "ADMIN"];

export default function StationLayout({ children }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const { user, allowed } = useAuthGuard(ALLOWED);

    if (!allowed) return <PageLoading label="Loading your station portal…" />;

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
            <StationSidebar user={user} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
            <div className="min-w-0 flex-1">
                <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                    <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Open menu">
                        <Menu className="h-5 w-5" />
                    </button>
                    <span className="font-semibold text-slate-900 lg:hidden dark:text-white">Station desk</span>
                    <div className="flex-1" />
                    <NotificationBell />
                </header>
                <main>{children}</main>
            </div>
        </div>
    );
}
