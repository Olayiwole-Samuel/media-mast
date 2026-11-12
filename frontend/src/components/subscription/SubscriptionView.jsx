"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Gem, Check, Loader2, CalendarClock, Send } from "lucide-react";
import { getPlans, getMySubscription, requestEnterprise } from "@/lib/api";
import { useSession, isCompanyOwner } from "@/lib/auth";
import { advertiserPaths } from "@/lib/cart";
import { formatDate, formatMoney } from "@/lib/status";
import { PageLoading, ApiErrorState } from "@/components/common/PageState";

// Plan: booking is open to every approved account (pay per spot, priced from
// each station's rate card). Enterprise is the one plan offered here: a
// custom deal (volume discount, more storage, dedicated support) set up by
// the Media Masters team. The owner asks for it with this form; an admin then
// assigns it. The public pricing page is unchanged.

const formatStorage = (mb) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`);

const INCLUDED = [
    "Book any approved TV, radio, press and billboard station",
    "Prices straight from each station's rate card, plus VAT",
    "5% off with 3+ stations in one checkout, 10% with 5+",
    "1 GB of document storage",
    "Team logins with permissions",
];

const ENTERPRISE = [
    "Custom pricing and an extra discount on every booking",
    "Campaign planning across many stations and states",
    "More document storage (from 50 GB)",
    "A dedicated account manager",
    "Monthly or annual billing, invoiced",
];

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

export default function SubscriptionView() {
    const { user } = useSession();
    const paths = advertiserPaths(user);
    const canRequest = user?.accountType === "INDIVIDUAL" || isCompanyOwner(user);

    const [me, setMe] = useState(null);
    const [enterprise, setEnterprise] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({ message: "", phone: "" });
    const [sending, setSending] = useState(false);
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [p, m] = await Promise.all([getPlans(), getMySubscription()]);
            setEnterprise((p?.data?.plans || []).find((x) => x.code === "ENTERPRISE") || null);
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

    const send = async (e) => {
        e.preventDefault();
        setNotice(null);
        if (form.message.trim().length < 10) {
            setNotice({ ok: false, text: "Tell us a little about what you need (at least 10 characters)." });
            return;
        }
        setSending(true);
        try {
            const res = await requestEnterprise({ message: form.message.trim(), phone: form.phone.trim() });
            setNotice({ ok: true, text: res.message });
            setForm({ message: "", phone: "" });
        } catch (err) {
            setNotice({ ok: false, text: err?.message || "We couldn't send your request." });
        } finally {
            setSending(false);
        }
    };

    if (loading) return <PageLoading label="Loading your plan…" />;
    if (error) return <div className="p-4 sm:p-6 lg:p-8"><ApiErrorState error={error} what="your plan" onRetry={load} /></div>;

    const sub = me?.subscription;
    const plan = me?.plan;

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <Gem className="h-6 w-6 text-emerald-500" /> Plan
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">You can book airtime without a plan: you pay per spot at each station&apos;s rates. Enterprise adds a custom deal for larger advertisers.</p>
            </motion.div>

            {sub && plan && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">Your plan</p>
                    <p className="mt-1 text-xl font-bold text-emerald-900 dark:text-white">{plan.name} · {sub.interval === "ANNUAL" ? "annual" : "monthly"}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-800 dark:text-emerald-300">
                        <CalendarClock className="h-4 w-4" />
                        {sub.cancelAtPeriodEnd ? "Ends" : "Renews"} {formatDate(sub.currentPeriodEnd)} · {formatMoney(sub.price, sub.currency)}
                        {plan.discountPercent ? ` · extra ${plan.discountPercent}% off every booking` : ""}
                        {plan.storageMB ? ` · ${formatStorage(plan.storageMB)} storage` : ""}
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">Included for every account</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Pay per spot</p>
                    <ul className="mt-4 space-y-2">
                        {INCLUDED.map((f) => (
                            <li key={f} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {f}</li>
                        ))}
                    </ul>
                    <Link href={paths.stations} className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
                        Browse stations
                    </Link>
                </section>

                <section className="rounded-2xl border-2 border-emerald-400 bg-white p-6 dark:bg-slate-900">
                    <p className="text-sm font-semibold uppercase tracking-wider text-emerald-600">Enterprise</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Custom</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{enterprise?.description || "For brands and agencies booking across many stations."}</p>
                    <ul className="mt-4 space-y-2">
                        {ENTERPRISE.map((f) => (
                            <li key={f} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {f}</li>
                        ))}
                    </ul>

                    {plan?.code === "ENTERPRISE" ? (
                        <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">You&apos;re on Enterprise. Contact your account manager to change your deal.</p>
                    ) : canRequest ? (
                        <form onSubmit={send} className="mt-5 space-y-2">
                            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} maxLength={1000} className={`${inputClass} resize-none`} placeholder="Tell us about your plans, e.g. stations, states and how often you advertise." aria-label="What you need" />
                            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="Phone (optional)" aria-label="Phone" />
                            {notice && <p className={`text-sm ${notice.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{notice.text}</p>}
                            <button type="submit" disabled={sending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Talk to us about Enterprise
                            </button>
                        </form>
                    ) : (
                        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">Ask your company owner to request Enterprise.</p>
                    )}
                </section>
            </div>
        </div>
    );
}
