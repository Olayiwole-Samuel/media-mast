"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SidebarHeader({
    isCollapsed,
    onToggleCollapse,
    onMobileClose,
    workspaceName = "Media Manager Workspace",
}) {
    return (
        <div className="shrink-0 border-b border-slate-200/80">
            {/* Top bar: Logo + controls */}
            <div
                className={cn(
                    "flex h-14 items-center",
                    isCollapsed ? "justify-center px-2" : "justify-between px-4"
                )}
            >
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2.5 overflow-hidden"
                >
                    {isCollapsed ? (
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
                            MM
                        </span>
                    ) : (
                        <>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
                                MM
                            </span>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[15px] font-semibold tracking-tight text-slate-900">
                                        Media Manager
                                    </span>
                                    <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                        Enterprise
                                    </span>
                                </div>
                            </div>
                        </>
                    )}
                </Link>

                <div className="flex items-center gap-0.5">
                    <button
                        onClick={onMobileClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
                        aria-label="Close sidebar"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <button
                        onClick={onToggleCollapse}
                        className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:flex"
                        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                        ) : (
                            <ChevronLeft className="h-4 w-4" />
                        )}
                    </button>
                </div>
            </div>

            {/* Workspace */}
            {!isCollapsed && (
                <div className="px-4 pb-3">
                    <div className="flex items-center gap-2 rounded-lg bg-slate-50/80 px-2.5 py-2">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                Workspace
                            </p>
                            <p className="truncate text-sm font-medium text-slate-800">
                                {workspaceName}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}