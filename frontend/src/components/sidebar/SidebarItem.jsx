"use client";

import { memo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils"; // or your cn helper

const SidebarItem = memo(function SidebarItem({
    item,
    isActive,
    isCollapsed,
    index = 0,
}) {
    const Icon = item.icon;
    const hasBadge = typeof item.badge === "number" && item.badge > 0;

    return (
        <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03, duration: 0.2 }}
        >
            <Link
                href={item.href}
                title={isCollapsed ? item.label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                    "transition-all duration-200 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2",
                    isCollapsed ? "justify-center px-2" : "",
                    isActive
                        ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                )}
            >
                {/* Active left accent */}
                {isActive && (
                    <motion.span
                        layoutId="sidebar-active-indicator"
                        className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-white/90"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                )}

                <Icon
                    className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                        isActive
                            ? "text-white"
                            : "text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5",
                        isActive && "drop-shadow-sm"
                    )}
                />

                {!isCollapsed && (
                    <span className="flex-1 truncate transition-transform duration-200 group-hover:translate-x-0.5">
                        {item.label}
                    </span>
                )}

                {/* Badge */}
                {hasBadge && !isCollapsed && (
                    <motion.span
                        key={item.badge}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={cn(
                            "ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                            isActive
                                ? "bg-white/20 text-white"
                                : "bg-emerald-100 text-emerald-700"
                        )}
                    >
                        {item.badge > 99 ? "99+" : item.badge}
                    </motion.span>
                )}

                {/* Collapsed badge dot */}
                {hasBadge && isCollapsed && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                )}
            </Link>
        </motion.div>
    );
});

export default SidebarItem;