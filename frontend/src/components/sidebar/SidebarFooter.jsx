"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SidebarFooter({ isCollapsed }) {
    return (
        <div className={cn("px-3 pb-2", isCollapsed && "flex justify-center")}>
            <Link
                href="/"
                title={isCollapsed ? "Return to the public website" : undefined}
                className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500",
                    "transition-all duration-200 hover:bg-slate-100 hover:text-slate-800",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                    isCollapsed && "justify-center px-2"
                )}
            >
                <ArrowLeft className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5" />
                {!isCollapsed && (
                    <span className="truncate transition-transform duration-200 group-hover:translate-x-0.5">
                        Back to Website
                    </span>
                )}
            </Link>
        </div>
    );
}