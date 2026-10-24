"use client";

import Link from "next/link";
import { Loader2, AlertTriangle, Lock, Inbox, Clock } from "lucide-react";

// Shared loading / error / permission / empty states so a failed request is
// never shown as "0 items" and a missing permission is never shown as a crash.

const Shell = ({ icon: Icon, tone = "slate", title, children, action }) => {
    const tones = {
        slate: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
        red: "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400",
        amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
        emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    };

    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900">
            <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${tones[tone]}`}>
                <Icon className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
            {children && (
                <div className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">{children}</div>
            )}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
};

const buttonClass =
    "inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600";

export function PageLoading({ label = "Loading…" }) {
    return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        </div>
    );
}

export function PageError({ title = "Something went wrong", message, onRetry }) {
    return (
        <Shell
            icon={AlertTriangle}
            tone="red"
            title={title}
            action={
                onRetry && (
                    <button type="button" onClick={onRetry} className={buttonClass}>
                        Try again
                    </button>
                )
            }
        >
            {message || "Please check your connection and try again."}
        </Shell>
    );
}

export function NoPermission({ message }) {
    return (
        <Shell icon={Lock} tone="amber" title="You don't have access to this section">
            {message || "Ask your company owner to give you access if you need it."}
        </Shell>
    );
}

export function EmptyState({ icon = Inbox, title, message, action }) {
    return (
        <Shell icon={icon} title={title} action={action}>
            {message}
        </Shell>
    );
}

export function NotAvailableYet({ title, message, href, linkLabel }) {
    return (
        <Shell
            icon={Clock}
            tone="emerald"
            title={title}
            action={
                href && (
                    <Link href={href} className={buttonClass}>
                        {linkLabel}
                    </Link>
                )
            }
        >
            {message}
        </Shell>
    );
}

// Picks the right state for an error thrown by lib/api.js (ApiError.status).
export function ApiErrorState({ error, what = "this page", onRetry }) {
    if (error?.status === 403) return <NoPermission />;
    return (
        <PageError
            title={`We couldn't load ${what}`}
            message={error?.message}
            onRetry={onRetry}
        />
    );
}
