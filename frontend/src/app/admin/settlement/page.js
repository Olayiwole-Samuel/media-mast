"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Scale, Loader2, FileText, Film, Send, Settings2 } from "lucide-react";
import {
    getAdminDisputes, resolveAdminDispute, getAdminPayouts, markAdminPayoutPaid, declineAdminPayout,
    getSettlementSettings, updateSettlementSettings, fetchFileUrl, bookingProofPath,
} from "@/lib/api";
import { DISPUTE_REASONS, formatDate, formatMoney } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";
import { announceDataChanged } from "@/lib/events";

// Money held until spots air: disputes to decide, payouts to send to media
// houses, and the rules (dispute window, confirmation deadline, commission).

const REASON = Object.fromEntries(DISPUTE_REASONS.map((r) => [r.value, r.label]));
const inputClass = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none";
const TABS = [
    { value: "disputes", label: "Disputes", icon: Scale },
    { value: "payouts", label: "Payouts", icon: Send },
    { value: "settings", label: "Settings", icon: Settings2 },
];

const openProof = async (id, which) => {
    const tab = window.open("about:blank", "_blank");
    try {
        const url = await fetchFileUrl(bookingProofPath(id, which));
        if (tab) tab.location.href = url;
    } catch {
        tab?.close();
    }
};

function DisputeCard({ d, onDone }) {
    const [outcome, setOutcome] = useState("RELEASE");
    const [refund, setRefund] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const dispute = d.escrow?.dispute || {};
    const resolved = !!dispute.resolvedAt;

    const submit = async () => {
        setBusy(true); setError("");
        try {
            await resolveAdminDispute(d._id, { outcome, refundAmount: outcome === "SPLIT" ? Number(String(refund).replace(/[^\d.]/g, "")) : undefined, resolution: note });
            announceDataChanged();
            onDone();
        } catch (err) {
            setError(err?.message || "Couldn't resolve it.");
            setBusy(false);
        }
    };

    return (
        <li className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col justify-between gap-2 sm:flex-row">
                <div>
                    <p className="font-semibold text-white">{d.station?.name || "Station"} · {d.rateName || "spot"}{d.spotSeconds ? ` · ${d.spotSeconds}s` : ""}</p>
                    <p className="text-sm text-slate-400">{d.campaign?.name || "Campaign"} · {formatDate(d.date)} {d.time} · <span className="font-mono">{d.bookingReference}</span></p>
                </div>
                <p className="text-right text-sm text-slate-300">On hold <span className="font-semibold text-white">{formatMoney(d.remaining, d.currency)}</span></p>
            </div>
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">
                <span className="font-semibold">{REASON[dispute.reason] || "Problem"}:</span> {dispute.details}
                <span className="block text-xs text-red-300/70">Raised {dispute.openedAt ? new Date(dispute.openedAt).toLocaleString("en-GB") : ""}</span>
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
                <button type="button" onClick={() => openProof(d._id, "log")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-slate-200 hover:bg-white/10"><FileText className="h-4 w-4" /> TX log</button>
                <button type="button" onClick={() => openProof(d._id, "clip")} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-slate-200 hover:bg-white/10"><Film className="h-4 w-4" /> Clip</button>
                {d.escrow?.proof?.note && <span className="self-center text-xs text-slate-400">Station note: &ldquo;{d.escrow.proof.note}&rdquo;</span>}
            </div>
            {resolved ? (
                <p className="text-sm text-emerald-300">Decided: {dispute.outcome === "RELEASE" ? "paid to the media house" : dispute.outcome === "REFUND" ? "refunded to the advertiser" : "split"} · {dispute.resolution}</p>
            ) : (
                <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                        {[["RELEASE", "It aired: pay the media house"], ["REFUND", "Refund the advertiser"], ["SPLIT", "Split"]].map(([v, l]) => (
                            <button key={v} type="button" onClick={() => setOutcome(v)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${outcome === v ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-300 hover:bg-white/20"}`}>{l}</button>
                        ))}
                    </div>
                    {outcome === "SPLIT" && <input value={refund} onChange={(e) => setRefund(e.target.value)} placeholder={`Refund to the advertiser (max ${formatMoney(d.remaining, d.currency)})`} className={inputClass} />}
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Decision note (both sides see this)" className={inputClass} />
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <button type="button" disabled={busy || !note.trim()} onClick={submit} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Decide
                    </button>
                </div>
            )}
        </li>
    );
}

function Disputes() {
    const [status, setStatus] = useState("open");
    const [state, setState] = useState({ loading: true, error: null, data: [] });
    const load = useCallback(async () => {
        setState((s) => ({ ...s, loading: true }));
        try {
            const res = await getAdminDisputes(status === "resolved" ? "resolved" : undefined);
            setState({ loading: false, error: null, data: res.data || [] });
        } catch (error) {
            setState({ loading: false, error, data: [] });
        }
    }, [status]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                {[["open", "Open"], ["resolved", "Decided"]].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setStatus(v)} className={`rounded-full px-3 py-1 text-xs font-medium ${status === v ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-300"}`}>{l}</button>
                ))}
            </div>
            {state.loading ? <PageLoading label="Loading disputes…" /> : state.error ? <ApiErrorState error={state.error} onRetry={load} /> : state.data.length === 0 ? (
                <EmptyState icon={Scale} title={status === "open" ? "No open disputes" : "No decided disputes yet"} message="When an advertiser disputes an aired spot, it appears here with the media house's TX log and clip." />
            ) : (
                <ul className="space-y-3">{state.data.map((d) => <DisputeCard key={d._id} d={d} onDone={load} />)}</ul>
            )}
        </div>
    );
}

function PayoutRow({ p, onDone }) {
    const [mode, setMode] = useState(null);
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const act = async () => {
        setBusy(true); setError("");
        try {
            if (mode === "paid") await markAdminPayoutPaid(p._id, text); else await declineAdminPayout(p._id, text);
            announceDataChanged();
            onDone();
        } catch (err) {
            setError(err?.message || "Couldn't update it.");
            setBusy(false);
        }
    };
    return (
        <li className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                    <p className="font-semibold text-white">{p.stationName || "Media house"} · {formatMoney(p.amount, p.currency)}</p>
                    <p className="text-sm text-slate-400">{p.account?.bankName} · {p.account?.accountNumber} · {p.account?.accountName}</p>
                    <p className="text-xs text-slate-500">Requested {formatDate(p.createdAt)}{p.reference ? ` · ref ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</p>
                </div>
                {p.status === "PENDING" ? (
                    <div className="flex gap-2">
                        <button type="button" onClick={() => { setMode("paid"); setText(""); }} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600">Mark paid</button>
                        <button type="button" onClick={() => { setMode("decline"); setText(""); }} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-white/20">Decline</button>
                    </div>
                ) : (
                    <span className={`text-xs font-semibold ${p.status === "PAID" ? "text-emerald-400" : "text-red-400"}`}>{p.status === "PAID" ? "Paid" : "Declined"}</span>
                )}
            </div>
            {mode && p.status === "PENDING" && (
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "paid" ? "Bank transfer reference" : "Why it's declined (they see this)"} className={inputClass} />
                    <button type="button" disabled={busy || !text.trim()} onClick={act} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === "paid" ? "Confirm paid" : "Confirm decline"}
                    </button>
                </div>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
        </li>
    );
}

function Payouts() {
    const [status, setStatus] = useState("PENDING");
    const [state, setState] = useState({ loading: true, error: null, data: [] });
    const load = useCallback(async () => {
        setState((s) => ({ ...s, loading: true }));
        try {
            const res = await getAdminPayouts(status || undefined);
            setState({ loading: false, error: null, data: res.data || [] });
        } catch (error) {
            setState({ loading: false, error, data: [] });
        }
    }, [status]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-400">Until Paystack transfers are connected: send the money from the company bank account, then mark it paid with the transfer reference.</p>
            <div className="flex gap-2">
                {[["PENDING", "Waiting"], ["PAID", "Paid"], ["DECLINED", "Declined"], ["", "All"]].map(([v, l]) => (
                    <button key={l} type="button" onClick={() => setStatus(v)} className={`rounded-full px-3 py-1 text-xs font-medium ${status === v ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-300"}`}>{l}</button>
                ))}
            </div>
            {state.loading ? <PageLoading label="Loading payouts…" /> : state.error ? <ApiErrorState error={state.error} onRetry={load} /> : state.data.length === 0 ? (
                <EmptyState icon={Send} title="No payouts here" message="Media houses request payouts of their earned money from their desk." />
            ) : (
                <ul className="space-y-3">{state.data.map((p) => <PayoutRow key={p._id} p={p} onDone={load} />)}</ul>
            )}
        </div>
    );
}

function Settings() {
    const [values, setValues] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    useEffect(() => {
        getSettlementSettings().then((r) => setValues(r.data)).catch((error) => setMessage({ type: "error", text: error?.message || "Couldn't load the settings." }));
    }, []);
    if (!values) return message ? <p className="text-sm text-red-400">{message.text}</p> : <PageLoading label="Loading settings…" />;

    const save = async (e) => {
        e.preventDefault();
        setBusy(true); setMessage(null);
        try {
            const res = await updateSettlementSettings({ disputeHours: Number(values.disputeHours), confirmHours: Number(values.confirmHours), commissionPercent: Number(values.commissionPercent) });
            setValues(res.data);
            setMessage({ type: "success", text: "Saved. New spots use these rules." });
        } catch (err) {
            setMessage({ type: "error", text: err?.message || "Couldn't save." });
        } finally { setBusy(false); }
    };

    const field = (key, label, hint, suffix) => (
        <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-200">{label}</span>
            <div className="flex items-center gap-2">
                <input type="number" step="0.5" value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} className={`${inputClass} max-w-[140px]`} />
                <span className="text-sm text-slate-400">{suffix}</span>
            </div>
            <span className="mt-1 block text-xs text-slate-500">{hint}</span>
        </label>
    );

    return (
        <form onSubmit={save} className="max-w-xl space-y-5 rounded-xl border border-white/10 bg-white/5 p-5">
            {field("disputeHours", "Dispute window", "After a media house marks a spot aired, how long the advertiser has to raise a problem before the money is paid out.", "hours")}
            {field("confirmHours", "Confirmation deadline", "How long after a spot's slot the media house has to mark it aired or not aired before it and admins are chased.", "hours")}
            {field("commissionPercent", "Media Masters commission", "Kept from each aired spot before the media house is paid (after VAT). 0 = none.", "%")}
            {message && <p className={`text-sm ${message.type === "error" ? "text-red-400" : "text-emerald-300"}`}>{message.text}</p>}
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
        </form>
    );
}

function SettlementInner() {
    const params = useSearchParams();
    const [tab, setTab] = useState(TABS.some((t) => t.value === params.get("tab")) ? params.get("tab") : "disputes");
    return (
        <div className="min-h-screen space-y-6 bg-slate-950 p-4 text-white sm:p-6 lg:p-8">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Scale className="h-6 w-6 text-emerald-400" /> Disputes &amp; payouts</h1>
                <p className="mt-1 text-slate-400">Advertisers&apos; money is held until each spot airs. Media houses prove airing with a TX log and clip; advertisers can dispute within the window; media houses are paid after.</p>
            </div>
            <div className="flex gap-2 border-b border-white/10">
                {TABS.map(({ value, label, icon: Icon }) => (
                    <button key={value} type="button" onClick={() => setTab(value)} className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${tab === value ? "border-emerald-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
                        <Icon className="h-4 w-4" /> {label}
                    </button>
                ))}
            </div>
            {tab === "disputes" ? <Disputes /> : tab === "payouts" ? <Payouts /> : <Settings />}
        </div>
    );
}

export default function AdminSettlementPage() {
    return (
        <Suspense fallback={null}>
            <SettlementInner />
        </Suspense>
    );
}
