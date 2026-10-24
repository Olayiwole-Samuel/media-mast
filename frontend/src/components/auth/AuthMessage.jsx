"use client";

import { cn } from "@/lib/utils";

// Inline status box for the auth pages (same look as the login page's).
export default function AuthMessage({ tone = "error", children, className }) {
    if (!children) return null;
    return (
        <div
            role={tone === "error" ? "alert" : "status"}
            className={cn(
                "p-3 rounded-lg border text-sm leading-relaxed",
                tone === "error" && "bg-red-50 border-red-200 text-red-600",
                tone === "success" && "bg-emerald-50 border-emerald-200 text-emerald-700",
                tone === "info" && "bg-slate-50 border-slate-200 text-slate-600",
                className
            )}
        >
            {children}
        </div>
    );
}
