"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Gem, Loader2, Save } from "lucide-react";
import { getAdminSubscriptions, assignAdminSubscription, getAdminPlans, updateAdminPlan } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Subscriptions (who is on which plan, revenue), assigning a plan to an
// account (Enterprise or a custom deal), and editing plan prices and limits.

const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white";
const card = "rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900";
const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

function PlanEditor({ plan, onSaved }) {
    const [form, setForm] = useState({
        monthlyPrice: plan.monthlyPrice ?? "",
        annualPrice: plan.annualPrice ?? "",
        maxActiveCampaigns: plan.maxActiveCampaigns ?? "",
        storageMB: plan.storageMB ?? 0,
        discountPercent: plan.discountPercent ?? 0,
        teamSeats: plan.teamSeats ?? "",
        isActive: plan.isActive !== false,
    });
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

    const save = async () => {
        setBusy(true);
        setMsg(null);
        try {
            await updateAdminPlan(plan.code, {
                monthlyPrice: numOrNull(form.monthlyPrice),
                annualPrice: numOrNull(form.annualPrice),
                maxActiveCampaigns: numOrNull(form.maxActiveCampaigns),
                storageMB: Number(form.storageMB) || 0,
                discountPercent: Number(form.discountPercent) || 0,
                teamSeats: numOrNull(form.teamSeats),
                isActive: form.isActive,
            });
            setMsg({ ok: true, text: "Saved" });
            onSaved();
        } catch (err) {
            setMsg({ ok: false, text: err.message });
        } finally {
            setBusy(false);
        }
    };

    const field = (label, key, hint) => (
        <label className="block text-xs text-slate-500 dark:text-slate-400">
            {label}
            <input type="number" min="0" value={form[key]} onChange={set(key)} className={`${input} mt-1`} placeholder={hint} />
        </label>
    );

    return (
        <div className={card}>
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white">{plan.name}</h3>
                <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <input type="checkbox" checked={form.isActive} onChange={set("isActive")} /> Offered
                </label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
                {field("Monthly price (₦)", "monthlyPrice", "Empty = on request")}
                {field("Annual price (₦)", "annualPrice", "Empty = on request")}
                {field("Active campaigns", "maxActiveCampaigns", "Empty = unlimited")}
                {field("Storage (MB)", "storageMB")}
                {field("Extra discount (%)", "discountPercent")}
                {field("Team seats", "teamSeats", "Empty = unlimited")}
            </div>
            <div className="mt-4 flex items-center gap-3">
                <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </button>
                {msg && <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-500"}`}>{msg.text}</span>}
            </div>
        </div>
    );
}

export default function AdminSubscriptionsPage() {
    const [subs, setSubs] = useState(null);
    const [plans, setPlans] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [assign, setAssign] = useState({ email: "", planCode: "ENTERPRISE", interval: "ANNUAL", price: "", months: "" });
    const [assignMsg, setAssignMsg] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [s, p] = await Promise.all([getAdminSubscriptions(), getAdminPlans()]);
            setSubs(s);
            setPlans(p?.data || []);
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

    const submitAssign = async (e) => {
        e.preventDefault();
        setBusy(true);
        setAssignMsg(null);
        try {
            const res = await assignAdminSubscription({
                email: assign.email.trim(),
                planCode: assign.planCode,
                interval: assign.interval,
                price: Number(assign.price) || 0,
                ...(assign.months ? { months: Number(assign.months) } : {}),
            });
            setAssignMsg({ ok: true, text: res.message });
            setAssign((a) => ({ ...a, email: "", price: "", months: "" }));
            await load();
        } catch (err) {
            setAssignMsg({ ok: false, text: err.message });
        } finally {
            setBusy(false);
        }
    };

    if (loading && !subs) return <PageLoading label="Loading subscriptions…" />;
    if (error) return <ApiErrorState error={error} what="subscriptions" onRetry={load} />;

    const rows = subs?.data || [];
    const revenue = Object.entries(subs?.totals?.revenue || {});

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <Gem className="h-6 w-6 text-emerald-500" /> Subscriptions
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">Who is on which plan, revenue, and plan settings.</p>
            </motion.div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className={card}>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Active now</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{subs?.totals?.active ?? 0}</p>
                </div>
                {revenue.map(([cur, amt]) => (
                    <div key={cur} className={card}>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Subscription revenue ({cur})</p>
                        <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{formatMoney(amt, cur)}</p>
                    </div>
                ))}
            </div>

            <form onSubmit={submitAssign} className={card}>
                <h2 className="font-semibold text-slate-900 dark:text-white">Assign a plan</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">For Enterprise or a negotiated deal. The account gets the plan straight away; no online payment is taken.</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
                    <input type="email" required value={assign.email} onChange={(e) => setAssign({ ...assign, email: e.target.value })} placeholder="Account email" className={`${input} sm:col-span-2`} />
                    <select value={assign.planCode} onChange={(e) => setAssign({ ...assign, planCode: e.target.value })} className={input}>
                        {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                    </select>
                    <select value={assign.interval} onChange={(e) => setAssign({ ...assign, interval: e.target.value })} className={input}>
                        <option value="MONTHLY">Monthly</option>
                        <option value="ANNUAL">Annual</option>
                    </select>
                    <input type="number" min="0" required value={assign.price} onChange={(e) => setAssign({ ...assign, price: e.target.value })} placeholder="Agreed price (₦)" className={input} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <input type="number" min="1" max="36" value={assign.months} onChange={(e) => setAssign({ ...assign, months: e.target.value })} placeholder="Months (optional)" className={`${input} w-44`} />
                    <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Assign plan
                    </button>
                    {assignMsg && <span className={`text-sm ${assignMsg.ok ? "text-emerald-600" : "text-red-500"}`}>{assignMsg.text}</span>}
                </div>
            </form>

            <div>
                <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Plans</h2>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {plans.map((p) => <PlanEditor key={`${p.code}-${p.monthlyPrice}-${p.annualPrice}-${p.storageMB}`} plan={p} onSaved={load} />)}
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                {rows.length === 0 ? (
                    <EmptyState icon={Gem} title="No subscriptions yet" message="Subscriptions appear here once advertisers choose a plan." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Account</th>
                                    <th className="px-4 py-3 font-medium">Plan</th>
                                    <th className="px-4 py-3 font-medium text-right">Price</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 font-medium">Period ends</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {rows.map((s) => (
                                    <tr key={s._id}>
                                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                                            {s.companyId?.name || s.userId?.name || "—"}
                                            <span className="block text-xs text-slate-400">{s.companyId ? "Company" : "Individual"}{s.assignedByAdmin ? " · assigned" : ""}</span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.planName} · {s.interval === "ANNUAL" ? "annual" : "monthly"}</td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">{formatMoney(s.price, s.currency)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.activeNow ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                                                {s.activeNow ? (s.cancelAtPeriodEnd ? "Active · ending" : "Active") : s.status === "REPLACED" ? "Replaced" : "Ended"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(s.currentPeriodEnd)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
