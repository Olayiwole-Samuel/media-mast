"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, Search, X, Loader2, RefreshCw } from "lucide-react";
import { getAdminPayments, getAdminPayment } from "@/lib/api";
import { bookingStatus, formatDate, formatMoney, paymentStatus } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Every payment taken at checkout, with what was refunded through
// cancellations. Read-only: refunds happen when bookings are cancelled or
// declined, never from here.

const STATUS_FILTERS = [
    { value: "", label: "All" },
    { value: "SUCCESSFUL", label: "Paid" },
    { value: "REFUNDED", label: "Refunded" },
    { value: "PENDING", label: "Pending" },
    { value: "FAILED", label: "Failed" },
];

const Badge = ({ status, kind = paymentStatus }) => {
    const s = kind(status);
    return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
};

const payerOf = (p) => p.companyId?.name || p.userId?.name || p.userId?.email || "—";

function PaymentDetails({ id, onClose }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let live = true;
        getAdminPayment(id)
            .then((res) => live && setData(res.data))
            .catch((err) => live && setError(err));
        return () => { live = false; };
    }, [id]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Payment details" onClick={onClose}>
            <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Payment {data?.reference || ""}</h2>
                        {data && <p className="text-sm text-slate-500">{payerOf(data)} · {data.campaignId?.name || "—"}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {error ? (
                    <ApiErrorState error={error} what="this payment" />
                ) : !data ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-500" /></div>
                ) : (
                    <div className="space-y-5">
                        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4 dark:bg-slate-800">
                            <div><dt className="text-slate-500">Amount</dt><dd className="font-semibold text-slate-900 dark:text-white">{formatMoney(data.amount, data.currency)}</dd></div>
                            <div><dt className="text-slate-500">Platform fee</dt><dd className="font-medium text-slate-900 dark:text-white">{formatMoney(data.platformFee || 0, data.currency)}</dd></div>
                            <div><dt className="text-slate-500">Refunded</dt><dd className="font-medium text-slate-900 dark:text-white">{formatMoney(data.refundAmount || 0, data.currency)}</dd></div>
                            <div><dt className="text-slate-500">Status</dt><dd><Badge status={data.status} /></dd></div>
                            <div><dt className="text-slate-500">Provider</dt><dd className="font-medium text-slate-900 dark:text-white">{data.provider}</dd></div>
                            <div><dt className="text-slate-500">Paid on</dt><dd className="font-medium text-slate-900 dark:text-white">{formatDate(data.createdAt)}</dd></div>
                            <div className="col-span-2"><dt className="text-slate-500">Payer email</dt><dd className="break-all font-medium text-slate-900 dark:text-white">{data.userId?.email || "—"}</dd></div>
                        </dl>

                        <div>
                            <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Bookings ({data.bookings?.length || 0})</h3>
                            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                                {(data.bookings || []).map((b) => (
                                    <li key={b._id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="font-medium text-slate-900 dark:text-white">{b.stationId?.name || "Station"} · {formatDate(b.date)} {b.time}</p>
                                            <p className="text-xs text-slate-500">{b.bookingReference}{b.cancellationReason ? ` · ${b.cancellationReason}` : ""}</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                            <span className="font-medium text-slate-900 dark:text-white">{formatMoney(b.price, b.currency)}</span>
                                            {Number(b.refundAmount) > 0 && <span className="text-xs text-purple-600 dark:text-purple-300">refunded {formatMoney(b.refundAmount, b.currency)}</span>}
                                            {Number(b.cancellationFee) > 0 && <span className="text-xs text-slate-500">fee {formatMoney(b.cancellationFee, b.currency)}</span>}
                                            <Badge status={b.status} kind={bookingStatus} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AdminPaymentsPage() {
    const [status, setStatus] = useState("");
    const [query, setQuery] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setResult(await getAdminPayments(status));
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const payments = useMemo(() => {
        const list = result?.data || [];
        const q = query.trim().toLowerCase();
        if (!q) return list;
        return list.filter((p) =>
            [p.reference, payerOf(p), p.userId?.email, p.campaignId?.name].some((v) => String(v || "").toLowerCase().includes(q)));
    }, [result, query]);

    const totals = Object.entries(result?.totals || {});

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                        <CreditCard className="h-6 w-6 text-emerald-500" />
                        Payments
                    </h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">Checkout payments and the refunds made through cancellations.</p>
                </div>
                <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
            </motion.div>

            {totals.length > 0 && (
                <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {totals.map(([currency, t]) => [
                        ["Collected", t.collected],
                        ["Refunded", t.refunded],
                        ["Net", t.net],
                        ["Platform fees", t.platformFees],
                    ].map(([label, value]) => (
                        <div key={`${currency}-${label}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}{totals.length > 1 ? ` (${currency})` : ""}</p>
                            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{formatMoney(value, currency)}</p>
                        </div>
                    )))}
                </div>
            )}

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search reference, payer or campaign"
                        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
                    {STATUS_FILTERS.map((f) => (
                        <button
                            key={f.value || "all"}
                            type="button"
                            onClick={() => setStatus(f.value)}
                            aria-pressed={status === f.value}
                            className={`rounded-lg px-3 py-2 text-sm font-medium ${status === f.value ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {error ? (
                <ApiErrorState error={error} what="payments" onRetry={load} />
            ) : loading && !result ? (
                <PageLoading label="Loading payments…" />
            ) : payments.length === 0 ? (
                <EmptyState icon={CreditCard} title="No payments" message={query || status ? "No payments match these filters." : "Payments appear here once advertisers check out."} />
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Reference</th>
                                    <th className="px-4 py-3 font-medium">Payer</th>
                                    <th className="px-4 py-3 font-medium">Campaign</th>
                                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                                    <th className="px-4 py-3 font-medium text-right">Refunded</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 font-medium">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {payments.map((p) => (
                                    <tr key={p._id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60" onClick={() => setOpenId(p._id)}>
                                        <td className="px-4 py-3">
                                            <button type="button" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400" onClick={(e) => { e.stopPropagation(); setOpenId(p._id); }}>
                                                {p.reference}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                                            {payerOf(p)}
                                            <span className="block text-xs text-slate-400">{p.companyId ? "Company" : "Individual"}</span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.campaignId?.name || "—"}</td>
                                        <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">{formatMoney(p.amount, p.currency)}</td>
                                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{Number(p.refundAmount) > 0 ? formatMoney(p.refundAmount, p.currency) : "—"}</td>
                                        <td className="px-4 py-3"><Badge status={p.status} /></td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(p.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {openId && <PaymentDetails id={openId} onClose={() => setOpenId(null)} />}
        </div>
    );
}
