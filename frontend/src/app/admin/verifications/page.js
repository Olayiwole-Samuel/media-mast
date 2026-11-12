"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2, CheckCircle2, FileText, Loader2, Megaphone, RadioTower, ShieldCheck, XCircle } from "lucide-react";
import {
    getAdminVerifications, getAdminVerification, approveAdminVerification, rejectAdminVerification, saveProtectedFile,
} from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";
import { announceDataChanged } from "@/lib/events";

// Approvals: every new media client, media agency and media house sends its
// CAC number, TIN and documents (a media house also its rate card and rates).
// The admin checks them here, then approves (the account opens at once) or
// sends it back with a reason (the business fixes it and resubmits).

const TABS = [
    { value: "SUBMITTED", label: "Waiting" },
    { value: "REJECTED", label: "Sent back" },
    { value: "APPROVED", label: "Approved" },
    { value: "DRAFT", label: "Not submitted yet" },
];

const KIND = {
    CLIENT: { label: "Media client", icon: Building2 },
    AGENCY: { label: "Media agency", icon: Megaphone },
    MEDIA_HOUSE: { label: "Media house", icon: RadioTower },
};

const DOC_TITLE = {
    CAC_CERTIFICATE: "CAC certificate",
    RATE_CARD: "Rate card",
    TAX_CERTIFICATE: "Tax (TIN) certificate",
    ARCON_CERTIFICATE: "ARCON registration",
    BROADCAST_LICENCE: "Broadcast licence",
    OTHER: "Other document",
};

const card = "rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";

function Row({ label, value }) {
    return (
        <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{value || "—"}</p>
        </div>
    );
}

function Detail({ id, onDone }) {
    const [v, setV] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [reason, setReason] = useState("");
    const [message, setMessage] = useState(null);

    useEffect(() => {
        let live = true;
        getAdminVerification(id)
            .then((res) => { if (live) setV(res.data); })
            .catch((err) => { if (live) setError(err); });
        return () => { live = false; };
    }, [id]);

    if (error) return <ApiErrorState error={error} what="this verification" />;
    if (!v) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-emerald-500" /></div>;

    const decide = async (approve) => {
        setBusy(true);
        setMessage(null);
        try {
            const res = approve ? await approveAdminVerification(id) : await rejectAdminVerification(id, reason.trim());
            onDone(res.message);
        } catch (err) {
            setMessage({ ok: false, text: err.message });
        } finally {
            setBusy(false);
        }
    };

    const open = (doc) => saveProtectedFile(`/api/v1/admin/verifications/${id}/documents/${doc._id}/file`, doc.name)
        .catch((err) => setMessage({ ok: false, text: err.message }));
    const rates = v.station?.rateCard || [];
    const Kind = KIND[v.accountKind] || KIND.CLIENT;

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"><Kind.icon className="h-5 w-5" /></span>
                <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{v.businessName || "Unnamed business"}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{Kind.label} · {v.user?.name} · {v.user?.email}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <Row label="CAC registration number" value={v.registrationNumber} />
                <Row label="TIN" value={v.taxId} />
                {v.accountKind === "AGENCY" && <Row label="ARCON number" value={v.arconNumber} />}
                <Row label="Phone" value={v.phone} />
                <Row label="Address" value={v.address} />
                <Row label="Submitted" value={v.submittedAt ? formatDate(v.submittedAt) : null} />
                {v.station && <Row label="Media" value={`${v.station.type} · ${[v.station.location?.city, v.station.location?.state].filter(Boolean).join(", ")}`} />}
            </div>

            <div>
                <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Documents</p>
                {v.documents.length === 0 ? (
                    <p className="text-sm text-slate-500">None uploaded.</p>
                ) : (
                    <ul className="space-y-1.5">
                        {v.documents.map((d) => (
                            <li key={d._id}>
                                <button type="button" onClick={() => open(d)} className="flex items-center gap-2 text-sm text-emerald-700 hover:underline dark:text-emerald-400">
                                    <FileText className="h-4 w-4" /> {DOC_TITLE[d.kind] || d.kind}: {d.name}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {v.accountKind === "MEDIA_HOUSE" && (
                <div>
                    <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Rates entered ({rates.length})</p>
                    {rates.length === 0 ? (
                        <p className="text-sm text-slate-500">No rates yet.</p>
                    ) : (
                        <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-left text-xs">
                                <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    <tr><th className="px-3 py-2">Belt / placement</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Length</th><th className="px-3 py-2 text-right">Price</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {rates.map((r) => (
                                        <tr key={r._id}>
                                            <td className="px-3 py-1.5 text-slate-800 dark:text-slate-200">{r.name}{r.size ? ` · ${r.size}` : ""}</td>
                                            <td className="px-3 py-1.5 text-slate-500">{r.kind === "TIME_BELT" ? `${r.startTime}–${r.endTime}` : "In programme / day"}</td>
                                            <td className="px-3 py-1.5 text-slate-500">{r.spotSeconds ? `${r.spotSeconds}s` : "—"}</td>
                                            <td className="px-3 py-1.5 text-right font-medium text-slate-900 dark:text-white">{formatMoney(r.price, v.station.pricing?.currency || "NGN")}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {v.status === "REJECTED" && v.reviewNote && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">Sent back: {v.reviewNote}</p>
            )}

            {message && <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-500"}`}>{message.text}</p>}

            {v.status === "SUBMITTED" && (
                <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <button type="button" disabled={busy} onClick={() => decide(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve — open their account
                    </button>
                    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="What should they fix? e.g. The CAC certificate is unreadable." className="w-full resize-none rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                        <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => decide(false)} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30">
                            <XCircle className="h-4 w-4" /> Send back with this reason
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminVerificationsPage() {
    const [tab, setTab] = useState("SUBMITTED");
    const [rows, setRows] = useState(null);
    const [counts, setCounts] = useState({});
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);
    const [doneMessage, setDoneMessage] = useState("");

    // A notification links here with ?id=… : open that business straight away.
    useEffect(() => {
        const id = new URLSearchParams(window.location.search).get("id");
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (id) setSelected(id);
    }, []);

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await getAdminVerifications(tab);
            setRows(res.data || []);
            setCounts(res.counts || {});
        } catch (err) {
            setError(err);
        }
    }, [tab]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    if (error) return <div className="p-4 sm:p-6 lg:p-8"><ApiErrorState error={error} what="approvals" onRetry={load} /></div>;
    if (!rows) return <PageLoading label="Loading approvals…" />;

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <ShieldCheck className="h-6 w-6 text-emerald-500" /> Approvals
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">Check each new business&apos;s CAC number, TIN and documents (and a media house&apos;s rates) before it can trade.</p>
            </motion.div>

            <div className="flex flex-wrap gap-2">
                {TABS.map((t) => (
                    <button key={t.value} type="button" onClick={() => { setTab(t.value); setSelected(null); setDoneMessage(""); setRows(null); }}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t.value ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300"}`}>
                        {t.label}{counts[t.value] ? ` (${counts[t.value]})` : ""}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                <div className={`${card} overflow-hidden lg:col-span-2`}>
                    {rows.length === 0 ? (
                        <EmptyState icon={ShieldCheck} title={tab === "SUBMITTED" ? "Nothing waiting" : "Nothing here"} message={tab === "SUBMITTED" ? "New businesses appear here when they submit their details." : ""} />
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {rows.map((r) => {
                                const Kind = KIND[r.accountKind] || KIND.CLIENT;
                                return (
                                    <li key={r._id}>
                                        <button type="button" onClick={() => setSelected(r._id)} className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${selected === r._id ? "bg-emerald-50/60 dark:bg-emerald-500/10" : ""}`}>
                                            <Kind.icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{r.businessName || r.user?.name || "Unnamed"}</span>
                                                <span className="block text-xs text-slate-500">{Kind.label} · {r.registrationNumber || "no CAC yet"} · {r.documentCount} doc{r.documentCount === 1 ? "" : "s"}</span>
                                                {r.submittedAt && <span className="block text-[11px] text-slate-400">Submitted {formatDate(r.submittedAt)}</span>}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
                <div className={`${card} p-5 lg:col-span-3`}>
                    {selected ? (
                        <Detail key={selected} id={selected} onDone={(text) => {
                            // The decided business leaves the queue: clear it, reload, and let
                            // the sidebar counter and the bell update now.
                            setSelected(null);
                            setDoneMessage(text || "Done.");
                            load();
                            announceDataChanged();
                        }} />
                    ) : (
                        <div className="py-12 text-center text-sm text-slate-500">
                            {doneMessage && <p className="mb-2 font-medium text-emerald-600 dark:text-emerald-400">{doneMessage}</p>}
                            <p>{rows.length ? "Choose a business on the left to review it." : tab === "SUBMITTED" ? "Nothing waiting. New businesses appear here when they submit their details." : "Nothing here."}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
