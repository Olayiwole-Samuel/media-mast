"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function RememberMe({
    checked = false,
    onChange,
    name = "rememberMe",
    label = "Remember me",
    disabled = false,
    className,
    children,
    ...props
}) {
    const reduced = useReducedMotion();
    const generatedId = useId();
    const inputId = props.id || generatedId;

    return (
        <label
            htmlFor={inputId}
            className={cn(
                "group inline-flex cursor-pointer select-none items-center gap-2.5",
                disabled && "cursor-not-allowed opacity-60",
                className
            )}
        >
            {/* Visually Hidden Native Input for Accessibility & Form Support */}
            <input
                id={inputId}
                name={name}
                type="checkbox"
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                className="sr-only peer"
                {...props}
            />

            {/* Visual Custom Checkbox Box */}
            <div
                className={cn(
                    "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-all duration-200",
                    // Focus Styles triggered by peer-focus
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/40 peer-focus-visible:ring-offset-2",
                    checked
                        ? "border-emerald-500 bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]"
                        : "border-slate-300 bg-white group-hover:border-slate-400"
                )}
            >
                <svg
                    viewBox="0 0 12 12"
                    className="h-3 w-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <motion.path
                        d="M2 6.5l2.8 2.8L10 3.5"
                        initial={false}
                        animate={{
                            pathLength: checked ? 1 : 0,
                            opacity: checked ? 1 : 0,
                        }}
                        transition={
                            reduced
                                ? { duration: 0 }
                                : { duration: 0.2, ease: "easeOut" }
                        }
                    />
                </svg>
            </div>

            {/* Label Text */}
            <span className="text-sm font-medium text-slate-600 transition-colors group-hover:text-slate-800">
                {children || label}
            </span>
        </label>
    );
}