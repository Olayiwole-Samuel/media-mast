"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { NAV_GROUPS } from "@/lib/sidebar-nav";
import { cn } from "@/lib/utils";

export default function SidebarSearch({ isCollapsed, onExpand }) {
    const [query, setQuery] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef(null);
    const focusAfterExpandRef = useRef(false);
    const router = useRouter();

    const expandAndFocusSearch = useCallback(() => {
        focusAfterExpandRef.current = true;
        onExpand?.();
    }, [onExpand]);

    // Ctrl/Cmd + K shortcut
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                if (isCollapsed) {
                    expandAndFocusSearch();
                } else {
                    inputRef.current?.focus();
                }
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isCollapsed, expandAndFocusSearch]);

    useEffect(() => {
        if (!isCollapsed && focusAfterExpandRef.current) {
            inputRef.current?.focus();
            focusAfterExpandRef.current = false;
        }
    }, [isCollapsed, expandAndFocusSearch]);

    const results = useMemo(() => {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return NAV_GROUPS.flatMap((g) => g.items).filter((item) =>
            item.label.toLowerCase().includes(q)
        );
    }, [query]);

    if (isCollapsed) {
        return (
            <button
                onClick={expandAndFocusSearch}
                className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                title="Search (⌘K)"
                aria-label="Open search"
            >
                <Search className="h-4 w-4" />
            </button>
        );
    }

    return (
        <div className="relative px-3">
            <div
                className={cn(
                    "relative flex items-center rounded-xl border bg-slate-50/80 transition-all duration-200",
                    isFocused
                        ? "border-emerald-300 bg-white shadow-sm ring-2 ring-emerald-500/20"
                        : "border-slate-200 hover:border-slate-300"
                )}
            >
                <Search className="absolute left-3 h-4 w-4 text-slate-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setTimeout(() => setIsFocused(false), 150)}
                    placeholder="Quick search..."
                    className="w-full rounded-xl bg-transparent py-2 pl-9 pr-8 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                    aria-label="Search navigation"
                />
                {query && (
                    <button
                        onClick={() => setQuery("")}
                        className="absolute right-2.5 rounded p-0.5 text-slate-400 hover:text-slate-600"
                        aria-label="Clear search"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
                {!query && (
                    <kbd className="absolute right-2.5 hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:inline-block">
                        ⌘K
                    </kbd>
                )}
            </div>

            <AnimatePresence>
                {isFocused && results.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute left-3 right-3 z-50 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                    >
                        {results.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.href}
                                    onClick={() => {
                                        router.push(item.href);
                                        setQuery("");
                                        setIsFocused(false);
                                    }}
                                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                                >
                                    <Icon className="h-4 w-4 text-slate-400" />
                                    {item.label}
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
