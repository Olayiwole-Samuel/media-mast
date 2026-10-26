"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    LayoutDashboard,
    CalendarDays,
    Megaphone,
    Users,
    BarChart3,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    UserPlus,
    FileBarChart,
    Home,
    X,
    Building2,
    Radio,
    ShoppingCart,
    Inbox,
    KeyRound,
    Gem,
    FolderOpen,
    TrendingUp,
} from "lucide-react";
import { isCompanyOwner, signOut } from "@/lib/auth";
import { getMyStations } from "@/lib/api";

// ownerOnly items are hidden for employees (UX only — the backend enforces
// requireCompanyOwner / requirePermission on every route). Other sections
// show a "no access" message if the employee lacks the permission.
const NAV_ITEMS = [
    { label: "Dashboard", href: "/company/dashboard", icon: LayoutDashboard },
    { label: "Campaigns", href: "/company/campaigns", icon: Megaphone },
    { label: "Bookings", href: "/company/bookings", icon: CalendarDays },
    { label: "Stations", href: "/company/stations", icon: Radio },
    { label: "Cart", href: "/company/cart", icon: ShoppingCart },
    // Transition only: shown while this company still runs a station itself
    // (stations are normally run by admin-created station managers).
    { label: "Station requests", href: "/company/station-requests", icon: Inbox, stationOperatorOnly: true },
    { label: "Team", href: "/company/team", icon: Users },
    { label: "Departments", href: "/company/departments", icon: Building2 },
    { label: "Analytics", href: "/company/analytics", icon: BarChart3 },
    { label: "Spend insights", href: "/company/insights", icon: TrendingUp },
    { label: "Documents", href: "/company/documents", icon: FolderOpen },
    { label: "Plan", href: "/company/subscription", icon: Gem },
    { label: "Settings", href: "/company/settings", icon: Settings, ownerOnly: true },
    { label: "Change password", href: "/change-password", icon: KeyRound },
];

const QUICK_ACTIONS = [
    {
        label: "Invite team member",
        href: "/company/team",
        icon: UserPlus,
        color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
        ownerOnly: true,
    },
    {
        label: "Create campaign",
        href: "/company/campaigns",
        icon: Megaphone,
        color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    },
    {
        label: "View reports",
        href: "/company/analytics",
        icon: FileBarChart,
        color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    },
];

export default function CompanySidebar({
    isOpen = true,
    onToggle,
    mobileOpen = false,
    onMobileClose,
    user,
}) {
    const pathname = usePathname();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [hoveredItem, setHoveredItem] = useState(null);
    const [runsStations, setRunsStations] = useState(false);

    // Only companies still operating a station see "Station requests".
    useEffect(() => {
        let live = true;
        getMyStations()
            .then((res) => live && setRunsStations(Array.isArray(res?.data) && res.data.length > 0))
            .catch(() => live && setRunsStations(false));
        return () => { live = false; };
    }, []);

    const userName = user?.name || "User Workspace";
    const userEmail = user?.email || "";
    const userImage = user?.image;
    const userInitial = userName.charAt(0).toUpperCase();

    const toggleCollapse = () => {
        const next = !isCollapsed;
        setIsCollapsed(next);
        onToggle?.(next);
    };

    const isLinkActive = (href) => {
        if (href === "/company/dashboard") return pathname === "/company/dashboard";
        return pathname?.startsWith(href);
    };

    const owner = isCompanyOwner(user);
    // Employees get their own dashboard (their work); the company dashboard
    // (analytics) stays with the owner.
    const navItems = NAV_ITEMS
        .map((item) => (!owner && item.href === "/company/dashboard" ? { ...item, label: "My dashboard", href: "/company/workspace" } : item))
        .filter((item) => (owner || !item.ownerOnly) && (runsStations || !item.stationOperatorOnly));
    const homeHref = owner ? "/company/dashboard" : "/company/workspace";
    const quickActions = QUICK_ACTIONS.filter((item) => owner || !item.ownerOnly);

    const handleLogout = signOut;

    return (
        <>
            {/* Mobile Backdrop */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
                        onClick={onMobileClose}
                        aria-hidden="true"
                    />
                )}
            </AnimatePresence>

            {/* Main Sidebar */}
            <motion.aside
                animate={{ width: isCollapsed ? 80 : 260 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={`
                    fixed inset-y-0 left-0 z-50 flex flex-col
                    border-r border-slate-200/80 bg-white/90 backdrop-blur-2xl
                    dark:border-slate-800/80 dark:bg-slate-950/90
                    transition-transform duration-300 ease-out
                    ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                `}
            >
                {/* Header / Brand */}
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 px-4 dark:border-slate-800/80">
                    <Link
                        href={homeHref}
                        className="flex items-center gap-3 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20">
                            <Building2 className="h-5 w-5" />
                        </div>

                        {!isCollapsed && (
                            <motion.span
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -6 }}
                                transition={{ duration: 0.15 }}
                                className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white"
                            >
                                Company{" "}
                                <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-300">
                                    Workspace
                                </span>
                            </motion.span>
                        )}
                    </Link>

                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={onMobileClose}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:hidden"
                            aria-label="Close sidebar"
                        >
                            <X className="h-4 w-4" strokeWidth={2} />
                        </button>

                        <button
                            type="button"
                            onClick={toggleCollapse}
                            aria-expanded={!isCollapsed}
                            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-slate-800 dark:hover:bg-slate-800/80 dark:hover:text-slate-200 lg:flex"
                        >
                            {isCollapsed ? (
                                <ChevronRight className="h-4 w-4" strokeWidth={2} />
                            ) : (
                                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
                            )}
                        </button>
                    </div>
                </div>

                {/* Main Navigation Scroll Area */}
                <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-none">
                    {/* Primary Links */}
                    <div className="space-y-1">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const active = isLinkActive(item.href);

                            return (
                                <div key={item.href} className="relative">
                                    <Link
                                        href={item.href}
                                        aria-current={active ? "page" : undefined}
                                        onMouseEnter={() => setHoveredItem(item.href)}
                                        onMouseLeave={() => setHoveredItem(null)}
                                        className={`
                                            relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium
                                            transition-all duration-150 outline-none
                                            focus-visible:ring-2 focus-visible:ring-emerald-500/40
                                            ${isCollapsed ? "justify-center" : ""}
                                            ${active
                                                ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 font-semibold"
                                                : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-100"
                                            }
                                        `}
                                    >
                                        <Icon
                                            className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                                                active ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
                                            }`}
                                            strokeWidth={active ? 2.25 : 2}
                                        />

                                        {!isCollapsed && (
                                            <span className="truncate">{item.label}</span>
                                        )}

                                        {/* Active Pill Indicator */}
                                        {active && (
                                            <motion.div
                                                layoutId="activeNavIndicator"
                                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                                className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-emerald-500"
                                            />
                                        )}
                                    </Link>

                                    {/* Collapsed Hover Floating Label */}
                                    <AnimatePresence>
                                        {isCollapsed && hoveredItem === item.href && (
                                            <motion.div
                                                initial={{ opacity: 0, x: -6 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -6 }}
                                                transition={{ duration: 0.12 }}
                                                className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white shadow-xl dark:bg-slate-800 dark:border dark:border-slate-700/50"
                                            >
                                                {item.label}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })}
                    </div>

                    {/* Quick Actions Header Divider */}
                    <div className="relative pt-2">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-slate-200/80 dark:border-slate-800/80" />
                        </div>
                        {!isCollapsed && (
                            <div className="relative flex justify-start">
                                <span className="bg-white pr-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:bg-slate-950 dark:text-slate-500">
                                    Quick Actions
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Quick Action List */}
                    <div className="space-y-1">
                        {quickActions.map((action) => {
                            const Icon = action.icon;
                            return (
                                <div key={action.label} className="relative">
                                    <Link
                                        href={action.href}
                                        onMouseEnter={() => setHoveredItem(action.label)}
                                        onMouseLeave={() => setHoveredItem(null)}
                                        className={`
                                            flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium
                                            text-slate-600 transition-colors duration-150 outline-none
                                            hover:bg-slate-100/70 hover:text-slate-900
                                            focus-visible:ring-2 focus-visible:ring-emerald-500/40
                                            dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-100
                                            ${isCollapsed ? "justify-center" : ""}
                                        `}
                                    >
                                        <div
                                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${action.color}`}
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
                                                initial={{ opacity: 0, x: -6 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -6 }}
                                                transition={{ duration: 0.12 }}
                                                className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white shadow-xl dark:bg-slate-800 dark:border dark:border-slate-700/50"
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

                {/* Profile / Footer */}
                <div className="shrink-0 border-t border-slate-200/80 p-3 dark:border-slate-800/80">
                    <div className={`flex items-center gap-2 ${isCollapsed ? "flex-col justify-center" : "justify-between"}`}>
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
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-[13px] font-bold text-white shadow-sm shadow-emerald-500/20">
                                    {userInitial}
                                </div>
                            )}

                            {!isCollapsed && (
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                                        {userName}
                                    </p>
                                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                        {userEmail}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className={`flex items-center gap-1 ${isCollapsed ? "flex-col pt-1" : ""}`}>
                            <Link
                                href="/"
                                title="Back to homepage"
                                aria-label="Back to homepage"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                                <Home className="h-4 w-4" strokeWidth={2} />
                            </Link>

                            <button
                                type="button"
                                onClick={handleLogout}
                                title="Sign out"
                                aria-label="Sign out"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
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