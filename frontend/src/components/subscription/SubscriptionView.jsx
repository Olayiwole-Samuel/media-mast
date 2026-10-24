"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Gem, Check, Loader2, CalendarClock, HardDrive, Megaphone, Percent, Users } from "lucide-react";
import { getPlans, getMySubscription, subscribeToPlan, cancelMySubscription } from "@/lib/api";
import { useSession, isCompanyOwner } from "@/lib/auth";
import { advertiserPaths } from "@/lib/cart";
import { formatDate, formatMoney } from "@/lib/status";
import { PageLoading, ApiErrorState } from "@/components/common/PageState";

// The advertiser's plan: current subscription, usage against its limits, and
// the plans to choose from (monthly or annual). Booking needs a plan.

const formatStorage = (mb) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`);
const formatBytes = (b) => (b >= 1024 * 1024 * 1024 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 * 1024 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

const planFeatures = (p) => [
    p.maxActiveCampaigns ? `${p.maxActiveCampaigns} active campaign${p.maxActiveCampaigns === 1 ? "" : "s"}` : "Unlimited active campaigns",
    `${formatStorage(p.storageMB)} document storage`,
    p.discountPercent ? `Extra ${p.discountPercent}% off every booking` : null,
    p.teamSeats ? `Up to ${p.teamSeats} team members` : "Unlimited team members",
    "Book TV, radio, press, billboard and digital",
].filter(Boolean);

export default function SubscriptionView() {
    const { user } = useSession();
    const paths = advertiserPaths(user);
    const canChange = user?.accountType === "INDIVIDUAL" || isCompanyOwner(user);

    const [plans, setPlans] = useState([]);
    const [me, setMe] = useState(null);
    const [billing, setBilling] = useState("MONTHLY");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [p, m] = await Promise.all([getPlans(), getMySubscription()]);
            setPlans(p?.data?.plans || []);
            setMe(m?.data || null);
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

    const choose = async (plan) => {
        setBusy(plan.code);
        setNotice(null);
        try {
            const res = await subscribeToPlan(plan.code, billing);
            setNotice({ type: "success", text: `${res.message}${res.data?.testMode ? " (Test mode: no money was charged.)" : ""}` });
            await load();
        } catch (err) {
            setNotice({ type: "error", text: err.message });
        } finally {
            setBusy(null);
        }
    };

    const cancel = async () => {
        if (!window.confirm("Stop your plan renewing? You keep access until the end of the current period.")) return;
        setBusy("cancel");
        try {
            const res = await cancelMySubscription();
            setNotice({ type: "success", text: res.message });
            await load();
        } catch (err) {
            setNotice({ type: "error", text: err.message });
        } finally {
            setBusy(null);
        }
    };

    if (loading) return <PageLoading label="Loading your plan…" />;
    if (error) return <ApiErrorState error={error} what="your plan" onRetry={load} />;

    const sub = me?.subscription;
    const plan = me?.plan;
    const usage = me?.usage || {};

    return (
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <Gem className="h-6 w-6 text-emerald-500" /> Your plan
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    A plan lets you book airtime across stations, with document storage and booking discounts.
                </p>
            </motion.div>

            {notice && (
                <div className={`rounded-xl border p-3 text-sm ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"}`} role="status">
                    {notice.text}
                </div>
            )}

            {/* Current plan */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                {sub ? (
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Current plan</p>
                            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                                {sub.planName} · {sub.interval === "ANNUAL" ? "annual" : "monthly"}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                <CalendarClock className="h-4 w-4" />
                                {sub.cancelAtPeriodEnd ? `Ends ${formatDate(sub.currentPeriodEnd)} (won't renew)` : `Renews ${formatDate(sub.currentPeriodEnd)}`}
                                {sub.price ? ` · ${formatMoney(sub.price, sub.currency)}` : ""}
                            </p>
                        </div>
                        {plan && (
                            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                                    <dt className="flex items-center gap-1 text-slate-500 dark:text-slate-400"><Megaphone className="h-3.5 w-3.5" /> Active campaigns</dt>
                                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{usage.activeCampaigns ?? 0} / {plan.maxActiveCampaigns || "∞"}</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                                    <dt className="flex items-center gap-1 text-slate-500 dark:text-slate-400"><HardDrive className="h-3.5 w-3.5" /> Storage</dt>
                                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{formatBytes(usage.storageUsedBytes || 0)} / {formatStorage(plan.storageMB)}</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                                    <dt className="flex items-center gap-1 text-slate-500 dark:text-slate-400"><Percent className="h-3.5 w-3.5" /> Plan discount</dt>
                                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{plan.discountPercent || 0}%</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                                    <dt className="flex items-center gap-1 text-slate-500 dark:text-slate-400"><Users className="h-3.5 w-3.5" /> Team seats</dt>
                                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{plan.teamSeats || "Unlimited"}</dd>
                                </div>
                            </dl>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-lg font-semibold text-slate-900 dark:text-white">You don&apos;t have a plan yet</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Browsing stations and planning campaigns are free. Choose a plan below to book airtime.
                            </p>
                        </div>
                        <Link href={paths.stations} className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Browse stations →</Link>
                    </div>
                )}
                {sub && canChange && !sub.cancelAtPeriodEnd && !sub.assignedByAdmin && (
                    <button type="button" onClick={cancel} disabled={busy === "cancel"} className="mt-5 text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400">
                        Stop renewal
                    </button>
                )}
                {!canChange && (
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Only the company owner can change the plan.</p>
                )}
            </div>

            {/* Plans */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{sub ? "Change plan" : "Choose a plan"}</h2>
                <div className="inline-flex rounded-xl border border-slate-200 p-1 text-sm dark:border-slate-700" role="group" aria-label="Billing period">
                    {["MONTHLY", "ANNUAL"].map((i) => (
                        <button key={i} type="button" onClick={() => setBilling(i)} aria-pressed={billing === i} className={`rounded-lg px-3 py-1.5 font-medium ${billing === i ? "bg-emerald-500 text-white" : "text-slate-600 dark:text-slate-300"}`}>
                            {i === "MONTHLY" ? "Monthly" : "Annual"}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {plans.map((p) => {
                    const price = billing === "ANNUAL" ? p.annualPrice : p.monthlyPrice;
                    const current = sub && sub.planCode === p.code && sub.interval === billing;
                    const saving = billing === "ANNUAL" && p.monthlyPrice && p.annualPrice ? Math.round((1 - p.annualPrice / (p.monthlyPrice * 12)) * 100) : 0;
                    return (
                        <div key={p.code} className={`flex flex-col rounded-2xl bg-white p-6 dark:bg-slate-900 ${p.highlighted ? "border-2 border-emerald-500" : "border border-slate-200 dark:border-slate-800"}`}>
                            {p.highlighted && <span className="mb-3 self-start rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Most popular</span>}
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{p.name}</h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{p.description}</p>
                            <p className="mt-4 text-3xl font-bold text-slate-900 dark:text-white">
                                {p.priceOnRequest || price == null ? "Custom" : formatMoney(price, p.currency)}
                                {!(p.priceOnRequest || price == null) && <span className="text-sm font-normal text-slate-500"> / {billing === "ANNUAL" ? "year" : "month"}</span>}
                            </p>
                            {saving > 0 && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Save {saving}% with annual billing</p>}
                            <ul className="mt-4 flex-1 space-y-2 text-sm">
                                {planFeatures(p).map((f) => (
                                    <li key={f} className="flex gap-2 text-slate-600 dark:text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{f}</li>
                                ))}
                            </ul>
                            {p.priceOnRequest || price == null ? (
                                <p className="mt-5 rounded-xl bg-slate-50 p-3 text-center text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    Contact Media Masters and we&apos;ll set it up for you.
                                </p>
                            ) : (
                                <button
                                    type="button"
                                    disabled={!canChange || current || busy !== null}
                                    onClick={() => choose(p)}
                                    className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${p.highlighted ? "bg-emerald-500 text-white hover:bg-emerald-600" : "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                                >
                                    {busy === p.code && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {current ? "Current plan" : sub ? `Switch to ${p.name}` : `Choose ${p.name}`}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Payments run in test mode until online payment is switched on, so no money is charged yet. A plan change takes effect straight away.
            </p>
        </div>
    );
}
