"use client";

import { Eye } from "lucide-react";
import { useSession, isSupportView, endSupportSession } from "@/lib/auth";

// Shown across the top while an admin is looking at someone's account
// (read-only, this tab only).
export default function SupportBanner() {
    const { ready, user } = useSession();
    if (!ready || !isSupportView()) return null;
    const exit = () => {
        endSupportSession();
        window.close();
        window.location.assign("/admin/support");
    };
    return (
        <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-3 bg-violet-600 px-4 py-2 text-sm text-white">
            <Eye className="h-4 w-4" />
            <span>Support view of <strong>{user?.name || user?.email || "this account"}</strong>: read-only. Nothing can be changed from here.</span>
            <button type="button" onClick={exit} className="rounded-md bg-white/20 px-3 py-1 font-medium hover:bg-white/30">Exit</button>
        </div>
    );
}
