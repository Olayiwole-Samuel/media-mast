"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Lock, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils"; // optional

export default function PasswordInput({
    name = "password",
    label = "Password",
    placeholder = " ",
    value,
    onChange,
    error,
    disabled = false,
    autoComplete = "current-password",
    className,
    ...props
}) {
    const [focused, setFocused] = useState(false);
    const [visible, setVisible] = useState(false);
    const reduced = useReducedMotion();

    const hasValue = Boolean(value?.length);
    const isActive = focused || hasValue;
    const isValid = hasValue && !error;

    return (
        <div className={cn("relative", className)}>
            <div
                className={cn(
                    "group relative flex items-center rounded-xl border bg-white",
                    "transition-all duration-200 ease-out",
                    focused && !error && "ring-[3px] ring-emerald-500/10",
                    error
                        ? "border-red-300 ring-[3px] ring-red-500/10"
                        : isValid
                            ? "border-emerald-400/70"
                            : focused
                                ? "border-emerald-500"
                                : "border-slate-200 hover:border-slate-300",
                    disabled && "cursor-not-allowed opacity-60 bg-slate-50"
                )}
            >
                {/* Lock icon */}
                <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
                    <Lock
                        className={cn(
                            "h-[18px] w-[18px] transition-colors duration-200",
                            error
                                ? "text-red-400"
                                : isValid || focused
                                    ? "text-emerald-500"
                                    : "text-slate-400 group-hover:text-slate-500"
                        )}
                    />
                </div>

                {/* Input */}
                <input
                    id={name}
                    name={name}
                    type={visible ? "text" : "password"}
                    value={value}
                    onChange={onChange}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete={autoComplete}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${name}-error` : undefined}
                    className={cn(
                        "peer w-full rounded-xl bg-transparent py-3.5 pl-11 pr-12",
                        "text-[15px] font-medium text-slate-800 outline-none",
                        "placeholder:text-transparent disabled:cursor-not-allowed",
                        "autofill:shadow-[inset_0_0_0_1000px_white]"
                    )}
                    {...props}
                />

                {/* Floating label */}
                <label
                    htmlFor={name}
                    className={cn(
                        "pointer-events-none absolute left-11 transition-all duration-200 ease-out",
                        isActive
                            ? "top-1.5 text-[11px] font-semibold tracking-wide"
                            : "top-1/2 -translate-y-1/2 text-[15px] font-medium",
                        error
                            ? "text-red-500"
                            : focused || isValid
                                ? "text-emerald-600"
                                : "text-slate-400"
                    )}
                >
                    {label}
                </label>

                {/* Show / Hide toggle */}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setVisible((v) => !v)}
                    disabled={disabled}
                    aria-label={visible ? "Hide password" : "Show password"}
                    className={cn(
                        "absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5",
                        "text-slate-400 transition-colors",
                        "hover:bg-slate-100 hover:text-slate-600",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40",
                        "disabled:pointer-events-none disabled:opacity-50"
                    )}
                >
                    <motion.span
                        key={visible ? "hide" : "show"}
                        initial={reduced ? false : { opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.15 }}
                        className="flex"
                    >
                        {visible ? (
                            <EyeOff className="h-4 w-4" />
                        ) : (
                            <Eye className="h-4 w-4" />
                        )}
                    </motion.span>
                </button>
            </div>

            {/* Error message */}
            <AnimatePresence mode="wait">
                {error && (
                    <motion.p
                        id={`${name}-error`}
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