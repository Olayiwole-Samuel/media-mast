"use client";

import { useEffect, useCallback, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { NAV_GROUPS } from "@/lib/sidebar-nav";
import SidebarHeader from "./SidebarHeader";
import SidebarSearch from "./SidebarSearch";
import SidebarGroup from "./SidebarGroup";
import SidebarFooter from "./SidebarFooter";
import SidebarUser from "./SidebarUser";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "media-manager-sidebar-collapsed";
const SIDEBAR_PREFERENCE_EVENT = "media-manager-sidebar-preference-change";

const getCollapsedSnapshot = () =>
    localStorage.getItem(STORAGE_KEY) === "true";

const getServerCollapsedSnapshot = () => false;

export default function Sidebar({
    mobileOpen = false,
    onMobileClose,
    workspaceName = "Media Manager Workspace",
}) {
    const pathname = usePathname();
    const { data: session } = useSession();
    const subscribeToCollapsedPreference = useCallback((onStoreChange) => {
        window.addEventListener("storage", onStoreChange);
        window.addEventListener(SIDEBAR_PREFERENCE_EVENT, onStoreChange);

        return () => {
            window.removeEventListener("storage", onStoreChange);
            window.removeEventListener(SIDEBAR_PREFERENCE_EVENT, onStoreChange);
        };
    }, []);
    const isCollapsed = useSyncExternalStore(
        subscribeToCollapsedPreference,
        getCollapsedSnapshot,
        getServerCollapsedSnapshot
    );

    const toggleCollapse = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, String(!isCollapsed));
        window.dispatchEvent(new Event(SIDEBAR_PREFERENCE_EVENT));
    }, [isCollapsed]);

    // Close on Escape
    useEffect(() => {
        if (!mobileOpen) return;
        const handler = (e) => {
            if (e.key === "Escape") onMobileClose?.();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [mobileOpen, onMobileClose]);

    // Prevent body scroll when mobile drawer is open
    useEffect(() => {
        if (mobileOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [mobileOpen]);

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
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
                        onClick={onMobileClose}
                        aria-hidden="true"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <motion.aside
                initial={false}
                animate={{
                    width: isCollapsed ? 88 : 280,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={cn(
                    "fixed inset-y-0 left-0 z-50 flex flex-col",
                    "bg-white/95 backdrop-blur-xl border-r border-slate-200/80",
                    "shadow-[1px_0_0_0_rgba(0,0,0,0.03)]",
                    // Mobile
                    mobileOpen ? "translate-x-0" : "-translate-x-full",
                    "lg:translate-x-0",
                    "transition-transform duration-300 ease-out lg:transition-none",
                    // Width handled by framer on desktop; fixed on mobile
                    "w-[280px] lg:w-auto"
                )}
                style={{
                    // Ensure GPU layer
                    willChange: "width, transform",
                }}
            >
                <SidebarHeader
                    isCollapsed={isCollapsed}
                    onToggleCollapse={toggleCollapse}
                    onMobileClose={onMobileClose}
                    workspaceName={workspaceName}
                />

                {/* Search */}
                <div className="mt-3 mb-2">
                    <SidebarSearch
                        isCollapsed={isCollapsed}
                        onExpand={toggleCollapse}
                    />
                </div>

                {/* Back to Website */}
                <SidebarFooter isCollapsed={isCollapsed} />

                {/* Navigation */}
                <nav
                    className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-3 py-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
                    aria-label="Main navigation"
                >
                    {NAV_GROUPS.map((group, groupIndex) => {
                        const startIndex = NAV_GROUPS.slice(0, groupIndex).reduce(
                            (total, previousGroup) => total + previousGroup.items.length,
                            0
                        );
                        return (
                            <SidebarGroup
                                key={group.id}
                                group={group}
                                pathname={pathname}
                                isCollapsed={isCollapsed}
                                startIndex={startIndex}
                            />
                        );
                    })}
                </nav>

                {/* User + Logout */}
                <SidebarUser session={session} isCollapsed={isCollapsed} />
            </motion.aside>
        </>
    );
}
