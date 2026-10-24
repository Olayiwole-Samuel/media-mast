"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function AuthFormCard({
    title,
    subtitle,
    children,
    shake = false,
    className,
}) {
    const reduced = useReducedMotion();

    return (
        <motion.div
            initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={cn("relative w-full mx-auto", className)}
        >
            <motion.div
                animate={
                    shake && !reduced
                        ? { x: [0, -8, 8, -5, 5, -2, 0] }
                        : { x: 0 }
                }
                transition={{ duration: 0.45, ease: "easeInOut" }}
                className="
          relative overflow-hidden rounded-3xl
          border border-slate-200/80 bg-white
          shadow-[0_20px_40px_-12px_rgba(15,23,42,0.07),0_8px_16px_-8px_rgba(15,23,42,0.03)]
        "
            >
                {/* Soft Highlight Border Top */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

                <div className="relative px-6 py-8 sm:px-9 sm:py-9">
                    {/* Header */}
                    {(title || subtitle) && (
                        <div className="mb-7 text-center">
                            {title && (
                                <h2 className="text-2xl sm:text-[1.7rem] font-semibold tracking-tight text-slate-900 leading-tight">
                                    {title}
                                </h2>
                            )}
                            {subtitle && (
                                <p className="mt-2 text-[14.5px] leading-relaxed text-slate-500 font-normal">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    )}

                    {children}
                </div>
            </motion.div>
        </motion.div>
    );
}