"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function AuthInput({
    label,
    name,
    type = "text",
    placeholder,
    value,
    onChange,
    icon: Icon,
    error,
    disabled = false,
    autoComplete,
    className,
    ...props
}) {
    const [focused, setFocused] = useState(false);
    const reduced = useReducedMotion();

    const hasValue = Boolean(value !== undefined && value !== null && String(value).length > 0);
    const isActive = focused || hasValue;
    const isValid = hasValue && !error;

    const errorId = `${name}-error`;

    return (
        <div className={cn("relative w-full", className)}>
            <div
                className={cn(
                    "group relative flex items-center rounded-xl border bg-white transition-all duration-200 ease-out",
                    // Focus state
                    focused && !error && "ring-[3px] ring-emerald-500/10 border-emerald-500",
                    // Error state
                    error
                        ? "border-red-300 ring-[3px] ring-red-500/10"
                        : isValid
                            ? "border-emerald-400/80"
                            : "border-slate-200 hover:border-slate-300",
                    disabled && "opacity-60 cursor-not-allowed bg-slate-50"
                )}
            >
                {/* Leading Icon */}
                {Icon && (
                    <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
                        <Icon
                            className={cn(
                                "h-[18px] w-[18px] transition-colors duration-200",
                                error
                                    ? "text-red-400"
                                    : focused || isValid
                                        ? "text-emerald-600"
                                        : "text-slate-400 group-hover:text-slate-500"
                            )}
                        />
                    </div>
                )}

                {/* Input Control */}
                <input
                    id={name}
                    name={name}
                    type={type}
                    value={value ?? ""}
                    onChange={onChange}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={placeholder || " "}
                    disabled={disabled}
                    autoComplete={
                        autoComplete ??
                        (type === "email" ? "email" : type === "password" ? "current-password" : "off")
                    }
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    className={cn(
                        "peer w-full rounded-xl bg-transparent text-[14.5px] font-medium text-slate-900 outline-none transition-all duration-200",
                        "placeholder:text-transparent disabled:cursor-not-allowed",
                        "autofill:shadow-[inset_0_0_0_1000px_white]",
                        isActive ? "pt-5 pb-1.5" : "py-3.5",
                        Icon ? "pl-11 pr-4" : "px-4"
                    )}
                    {...props}
                />

                {/* Floating Label */}
                {label && (
                    <label
                        htmlFor={name}
                        className={cn(
                            "pointer-events-none absolute transition-all duration-200 ease-out",
                            Icon ? "left-11" : "left-4",
                            isActive
                                ? "top-2 text-[11px] font-semibold tracking-wide"
                                : "top-1/2 -translate-y-1/2 text-[14.5px] font-medium",
                            error
                                ? "text-red-500"
                                : focused || isValid
                                    ? "text-emerald-600"
                                    : "text-slate-400"
                        )}
                    >
                        {label}
                    </label>
                )}
            </div>

            {/* Error Feedback */}
            <AnimatePresence mode="wait">
                {error && (
                    <motion.p
                        id={errorId}
                        key={error}
                        role="alert"
                        initial={reduced ? false : { opacity: 0, y: -4, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -3, height: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="mt-1.5 overflow-hidden pl-1 text-[13px] font-medium text-red-500"
                    >
                        {error}
                    </motion.p>
                )}
            </AnimatePresence>
        </div>
    );
}