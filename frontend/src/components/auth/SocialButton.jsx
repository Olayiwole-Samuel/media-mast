"use client";

import { isValidElement } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export default function SocialButton({
    provider = "Google",
    icon,
    onClick,
    loading = false,
    disabled = false,
    className,
    children,
    ...props
}) {
    const reduced = useReducedMotion();
    const isDisabled = disabled || loading;

    return (
        <motion.button
            type="button"
            onClick={onClick}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            aria-busy={loading}
            whileHover={
                reduced || isDisabled
                    ? undefined
                    : {
                        y: -1,
                        boxShadow: "0 6px 16px -6px rgba(15,23,42,0.08)",
                    }
            }
            whileTap={reduced || isDisabled ? undefined : { scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            className={cn(
                "group relative flex w-full items-center justify-center gap-3",
                "overflow-hidden rounded-xl border border-slate-200 bg-white",
                "px-5 py-3.5 text-sm font-medium text-slate-700",
                "transition-colors duration-200",
                "hover:border-slate-300 hover:bg-slate-50/80 hover:text-slate-900",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30 focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-60",
                className
            )}
            {...props}
        >
            {/* Icon / Loading Spinner */}
            {loading ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-slate-500" />
            ) : icon ? (
                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                    {typeof icon === "string" ? (
                        <Image
                            src={icon}
                            alt={`${provider} logo`}
                            width={20}
                            height={20}
                            className="h-5 w-5 object-contain"
                        />
                    ) : isValidElement(icon) ? (
                        icon
                    ) : null}
                </span>
            ) : null}

            {/* Button Text */}
            <span>{children || `Continue with ${provider}`}</span>

            {/* Subtle Arrow Indicator */}
            {!loading && (
                <ArrowRight className="h-3.5 w-3.5 -translate-x-0.5 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-50" />
            )}
        </motion.button>
    );
}