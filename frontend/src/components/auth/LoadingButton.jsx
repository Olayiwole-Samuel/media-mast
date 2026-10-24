"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoadingButton({
    loading = false,
    type = "button",
    children,
    disabled = false,
    loadingText = "Please wait…",
    showArrow = true,
    className,
    ...props
}) {
    const reduced = useReducedMotion();
    const isDisabled = loading || disabled;

    return (
        <motion.button
            type={type}
            disabled={isDisabled}
            aria-busy={loading}
            whileHover={
                reduced || isDisabled
                    ? undefined
                    : {
                        y: -1.5,
                        boxShadow: "0 12px 24px -8px rgba(16,185,129,0.35)",
                    }
            }
            whileTap={reduced || isDisabled ? undefined : { scale: 0.985 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className={cn(
                "group relative flex w-full items-center justify-center gap-2",
                "overflow-hidden rounded-xl px-5 py-3.5",
                "text-[15px] font-semibold text-white select-none",
                "transition-colors duration-200",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-75",
                loading
                    ? "bg-emerald-600"
                    : "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_6px_18px_-6px_rgba(16,185,129,0.35)] hover:from-emerald-600 hover:to-emerald-700",
                className
            )}
            {...props}
        >
            {/* Subtle shine highlight on hover */}
            {!loading && !isDisabled && (
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            )}

            <AnimatePresence mode="wait" initial={false}>
                {loading ? (
                    <motion.div
                        key="loading"
                        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="flex items-center gap-2"
                    >
                        <Loader2 className="h-4 w-4 animate-spin shrink-0 text-white" />
                        <span>{loadingText}</span>
                    </motion.div>
                ) : (
                    <motion.div
                        key="content"
                        initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="flex items-center justify-center gap-2"
                    >
                        <span>{children}</span>
                        {showArrow && (
                            <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.button>
    );
}