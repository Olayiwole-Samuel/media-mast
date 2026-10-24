"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Settings } from "lucide-react";
import { getMe } from "@/lib/api";
import { formatDate } from "@/lib/status";
import { PageLoading, ApiErrorState } from "@/components/common/PageState";
import NotificationPreferences from "@/components/settings/NotificationPreferences";

// Real account details from GET /auth/me. The password can be changed
// (/change-password); there are no self-service endpoints yet for changing
// profile details or notification preferences, so those are read-only.

const Row = ({ label, value }) => (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="text-sm font-medium text-slate-900 dark:text-white">{value || "—"}</dd>
    </div>
);

export default function SettingsPage() {
    const [me, setMe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getMe();
            setMe(result?.data || null);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    return (
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <Settings className="h-6 w-6 text-emerald-500" />
                    My account
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">Your account details.</p>
            </motion.div>

            {loading ? (
                <PageLoading label="Loading your account…" />
            ) : error ? (
                <ApiErrorState error={error} what="your account" onRetry={load} />
            ) : (
                <>
                    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-2 dark:border-slate-800 dark:bg-slate-900">
                        <dl>
                            <Row label="Name" value={me?.name} />
                            <Row label="Email" value={me?.email} />
                            <Row label="Account type" value="Individual" />
                            <Row label="Status" value={me?.status === "ACTIVE" ? "Active" : me?.status} />
                            <Row label="Member since" value={formatDate(me?.createdAt)} />
                            <Row label="Last sign-in" value={formatDate(me?.lastLogin)} />
                        </dl>
                    </div>

                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
                        <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">Password</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Changing it signs you out on every device.</p>
                        </div>
                        <Link href="/change-password" className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
                            Change password
                        </Link>
                    </div>

                    <NotificationPreferences />

                    <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Changing your name or email from here isn&apos;t available yet. Please contact the
                        Media Masters team if either needs to change.
                    </p>
                </>
            )}
        </div>
    );
}
