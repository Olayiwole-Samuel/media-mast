"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    LayoutDashboard,
    Radio,
    Megaphone,
    ShoppingCart,
    CalendarDays,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    X,
    Home,
    Gem,
    FolderOpen,
    TrendingUp,
} from "lucide-react";
import { signOut } from "@/lib/auth";

// Individual accounts: campaigns, stations, cart and bookings are all
// self-service (the backend serves individual advertisers).
const NAV_ITEMS = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Campaigns", href: "/campaigns", icon: Megaphone },
    { label: "Stations", href: "/stations", icon: Radio },
    { label: "Cart", href: "/cart", icon: ShoppingCart },
    { label: "Bookings", href: "/bookings", icon: CalendarDays },
    { label: "Documents", href: "/documents", icon: FolderOpen },
    { label: "Spend insights", href: "/insights", icon: TrendingUp },
    { label: "My plan", href: "/subscription", icon: Gem },
    { label: "My account", href: "/settings", icon: Settings },
];

const QUICK_ACTIONS = [
    {
        label: "Browse stations",
        href: "/stations",
        icon: Radio,
        color:
            "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/15",
    },
];

export default function DashboardSidebar({
    isOpen = true,
    onToggle,
    mobileOpen = false,
    onMobileClose,
    user,
}) {
    const pathname = usePathname();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [hoveredItem, setHoveredItem] = useState(null);

    const userName = user?.name || "User";
    const userEmail = user?.email || "";
    const userImage = user?.image;
    const userInitial = userName.charAt(0).toUpperCase();

    const toggleCollapse = () => {
        const next = !isCollapsed;
        setIsCollapsed(next);
        onToggle?.(next);
    };

    const isLinkActive = (href) => {
        if (href === "/dashboard") return pathname === "/dashboard";
        return pathname?.startsWith(href);
    };

    const handleLogout = signOut;

    return (
        <>
            {/* Mobile overlay */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
                        onClick={onMobileClose}
                        aria-hidden="true"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <motion.aside
                animate={{ width: isCollapsed ? 80 : 260 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className={`
          fixed inset-y-0 left-0 z-50 flex flex-col
          border-r border-slate-200/80 bg-white/95 backdrop-blur-xl
          dark:border-slate-800/80 dark:bg-slate-950/95
          transition-transform duration-300 ease-[cubic-bezier(0.21,0.47,0.32,0.98)]
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
            >
                {/* Brand header */}
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 px-3.5 dark:border-slate-800/80">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-2.5 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-[14px] font-semibold text-white shadow-sm shadow-emerald-600/25 dark:bg-emerald-500">
                            M
                        </div>

                        <AnimatePresence mode="wait">
                            {!isCollapsed && (
                                <motion.span
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: "auto" }}
                                    exit={{ opacity: 0, width: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white"
                                >
                                    Media
                                    <span className="text-emerald-600 dark:text-emerald-400">
                                        Master
                                    </span>
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </Link>

                    <div className="flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={onMobileClose}
                            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 lg:hidden dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            aria-label="Close sidebar"
                        >
                            <X className="h-4 w-4" strokeWidth={2} />
                        </button>

                        <button
                            type="button"
                            onClick={toggleCollapse}
                            className="hidden h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:border-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:flex"
                            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            {isCollapsed ? (
                                <ChevronRight className="h-4 w-4" strokeWidth={2} />
                            ) : (
                                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
                            )}
                        </button>
                    </div>
                </div>

                {/* Nav — premium thin scrollbar */}
                <nav className="sidebar-scroll flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-3 py-4">
                    {/* Primary links */}
                    <div className="space-y-0.5">
                        {NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            const active = isLinkActive(item.href);

                            return (
                                <div key={item.href} className="relative">
                                    <Link
                                        href={item.href}
                                        onMouseEnter={() => setHoveredItem(item.href)}
                                        onMouseLeave={() => setHoveredItem(null)}
                                        className={`
                      relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium
                      transition-colors duration-200
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30
                      ${isCollapsed ? "justify-center" : ""}
                      ${active
                                                ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                                : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white"
                                            }
                    `}
                                    >
                                        <Icon
                                            className={`h-[18px] w-[18px] shrink-0 ${active
                                                    ? "text-emerald-600 dark:text-emerald-400"
                                                    : "text-slate-400"
                                                }`}
                                            strokeWidth={2}
                                        />

                                        {!isCollapsed && (
                                            <span className="truncate">{item.label}</span>
                                        )}

                                        {active && (
                                            <motion.div
                                                layoutId="activeNavIndicator"
                                                className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-emerald-500"
                                            />
                                        )}
                                    </Link>

                                    {/* Collapsed tooltip */}
                                    <AnimatePresence>
                                        {isCollapsed && hoveredItem === item.href && (
                                            <motion.div
                                                initial={{ opacity: 0, x: -4 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -4 }}
                                                transition={{ duration: 0.12 }}
                                                className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white shadow-lg dark:bg-slate-800"
                                            >
                                                {item.label}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>

                    {/* Divider */}
                    <div className="relative border-t border-slate-200/80 dark:border-slate-800/80">
                        {!isCollapsed && (
                            <span className="absolute -top-2.5 left-3 bg-white px-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:bg-slate-950 dark:text-slate-500">
                                Quick Actions
                            </span>
                        )}
                    </div>

                    {/* Quick actions */}
                    <div className="space-y-0.5">
                        {QUICK_ACTIONS.map((action) => {
                            const Icon = action.icon;
                            return (
                                <div key={action.label} className="relative">
                                    <Link
                                        href={action.href}
                                        onMouseEnter={() => setHoveredItem(action.label)}
                                        onMouseLeave={() => setHoveredItem(null)}
                                        className={`
                      flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium
                      text-slate-600 transition-colors duration-200
                      hover:bg-slate-100/80 hover:text-slate-900
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30
                      dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white
                      ${isCollapsed ? "justify-center" : ""}
                    `}
                                    >
                                        <div
                                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${action.color}`}
                                        >
                                            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                                        </div>
                                        {!isCollapsed && (
                                            <span className="truncate">{action.label}</span>
                                        )}
                                    </Link>

                                    <AnimatePresence>
                                        {isCollapsed && hoveredItem === action.label && (
                                            <motion.div
                                                initial={{ opacity: 0, x: -4 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -4 }}
                                                transition={{ duration: 0.12 }}
                                                className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white shadow-lg dark:bg-slate-800"
                                            >
                                                {action.label}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>

                </nav>

                {/* User footer */}
                <div className="shrink-0 border-t border-slate-200/80 p-3 dark:border-slate-800/80">
                    <div
                        className={`flex items-center gap-2 ${isCollapsed ? "flex-col justify-center" : "justify-between"
                            }`}
                    >
                        <div className="flex min-w-0 items-center gap-3">
                            {userImage ? (
                                <Image
                                    src={userImage}
                                    alt={userName}
                                    width={36}
                                    height={36}
                                    className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-emerald-500/20"
                                />
                            ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-[13px] font-semibold text-white shadow-sm shadow-emerald-500/20">
                                    {userInitial}
                                </div>
                            )}

                            {!isCollapsed && (
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-medium text-slate-900 dark:text-white">
                                        {userName}
                                    </p>
                                    <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                                        {userEmail}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Actions: Home + Sign out */}
                        <div
                            className={`flex items-center gap-0.5 ${isCollapsed ? "flex-col" : ""
                                }`}
                        >
                            <div className="relative">
                                <Link
                                    href="/"
                                    onMouseEnter={() => setHoveredItem("homepage")}
                                    onMouseLeave={() => setHoveredItem(null)}
                                    title="Back to homepage"
                                    aria-label="Back to homepage"
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                                >
                                    <Home className="h-4 w-4" strokeWidth={2} />
                                </Link>

                                <AnimatePresence>
                                    {isCollapsed && hoveredItem === "homepage" && (
                                        <motion.div
                                            initial={{ opacity: 0, x: -4 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -4 }}
                                            transition={{ duration: 0.12 }}
                                            className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white shadow-lg dark:bg-slate-800"
                                        >
                                            Homepage
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <button
                                type="button"
                                onClick={handleLogout}
                                title="Sign out"
                                aria-label="Sign out"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                            >
                                <LogOut className="h-4 w-4" strokeWidth={2} />
                            </button>
                        </div>
                    </div>
                </div>
            </motion.aside>
        </>
    );
}