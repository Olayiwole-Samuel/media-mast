"use client";

import { useCallback, useEffect, useState } from "react";
import { Percent, Search, Loader2, ChevronDown, ChevronUp, Clock3, CheckCircle2, XCircle } from "lucide-react";
import { getVolumeAgreements, saveVolumeAgreement, deleteVolumeAgreement } from "@/lib/api";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// A media agency's volume discounts with each media house, from its existing
// agreements. Each one is sent to the media house to confirm; only confirmed
// discounts are used to price the agency's plans.

const STATUS = {
    PENDING: { label: "Waiting for the media house to confirm", icon: Clock3, tone: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300" },
    APPROVED: { label: "Confirmed: used in your plans", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" },
    REJECTED: { label: "Not confirmed", icon: XCircle, tone: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" },
};
const inputClass = "w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white";

function Row({ row, onSaved }) {
    const a = row.agreement;
    const [open, setOpen] = useState(false);
    const [percent, setPercent] = useState(a ? String(a.percent) : "");
    const [programmes, setProgrammes] = useState(() => Object.fromEntries(row.programmes.map((p) => [p.key, String((a?.programmes || []).find((x) => x.key === p.key)?.percent ?? "")])));
    const [note, setNote] = useState(a?.agencyNote || "");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const status = a ? STATUS[a.status] : null;

    const save = async () => {
        setBusy(true); setMessage(null);
        try {
            const res = await saveVolumeAgreement(row.station._id, {
                percent: Number(percent) || 0,
                note,
                programmes: row.programmes.map((p) => ({ key: p.key, percent: programmes[p.key] === "" ? null : Number(programmes[p.key]) })),
            });
            setMessage({ type: "success", text: res?.message || "Sent to confirm." });
            onSaved();
        } catch (err) {
            setMessage({ type: "error", text: err?.message || "Couldn't save." });
        } finally { setBusy(false); }
    };
    const remove = async () => {
        setBusy(true);
        try { await deleteVolumeAgreement(row.station._id); setPercent(""); onSaved(); } finally { setBusy(false); }
    };

    return (
        <li className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900 dark:text-white">{row.station.name}</p>
                    <p className="text-xs text-slate-500">{row.station.type}{row.station.state ? ` · ${row.station.state}` : ""}</p>
                    {status && (
                        <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>
                            <status.icon className="h-3.5 w-3.5" /> {status.label}{a.status === "REJECTED" && a.stationNote ? `: ${a.stationNote}` : ""}
                        </span>
                    )}
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    Volume discount <input value={percent} placeholder="0" onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={inputClass} /> %
                </label>
                <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                    By programme {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} {a ? "Update & send" : "Send to confirm"}
                </button>
                {a && <button type="button" disabled={busy} onClick={remove} className="text-xs text-red-600 hover:underline">Remove</button>}
            </div>
            {message && <p className={`px-4 pb-2 text-xs ${message.type === "error" ? "text-red-600" : "text-emerald-700 dark:text-emerald-300"}`}>{message.text}</p>}
            {open && (
                <div className="space-y-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note for the media house, e.g. our 2026 agreement reference" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    <p className="text-xs text-slate-500">Leave a programme empty to use the {percent || 0}% above.</p>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {row.programmes.map((p) => (
                            <li key={p.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                                <span className="min-w-0 text-slate-700 dark:text-slate-200">{p.name}<span className="text-xs text-slate-400">{p.startTime ? ` · ${p.startTime}–${p.endTime}` : p.size ? ` · ${p.size}` : ""}{p.lengths.length ? ` · ${p.lengths.map((l) => `${l}s`).join("/")}` : ""}</span></span>
                                <span className="flex items-center gap-1 text-slate-400"><input value={programmes[p.key]} placeholder={percent || "0"} onChange={(e) => setProgrammes({ ...programmes, [p.key]: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={inputClass} /> %</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </li>
    );
}

export default function CompanyDiscountsPage() {
    const [state, setState] = useState({ loading: true, error: null, data: [] });
    const [query, setQuery] = useState("");
    const [onlyMine, setOnlyMine] = useState(false);
    const load = useCallback(async () => {
        try {
            const res = await getVolumeAgreements();
            setState({ loading: false, error: null, data: res.data || [] });
        } catch (error) {
            setState((s) => ({ ...s, loading: false, error }));
        }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    if (state.loading) return <PageLoading label="Loading volume discounts…" />;
    if (state.error?.data?.code === "AGENCY_ONLY") {
        return <div className="p-4 sm:p-6 lg:p-8"><EmptyState icon={Percent} title="For media agencies" message="Volume discounts come from a media agency's agreements with media houses. Brands booking directly pay the rate card price." /></div>;
    }
    if (state.error) return <div className="p-4 sm:p-6 lg:p-8"><ApiErrorState error={state.error} onRetry={load} /></div>;
    const q = query.trim().toLowerCase();
    const rows = state.data.filter((r) => (!q || r.station.name.toLowerCase().includes(q)) && (!onlyMine || r.agreement));

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white"><Percent className="h-6 w-6 text-emerald-500" /> Volume discounts</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">Enter the volume discount you already have with each media house (and per programme where it differs). The media house confirms it, then it&apos;s taken off every spot in your plans: rate card − volume discount − 15% agency commission + VAT.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search media houses" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" className="accent-emerald-600" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Only ones I&apos;ve entered</label>
            </div>
            {rows.length === 0 ? <EmptyState icon={Percent} title="Nothing here" message="No media houses match." /> : (
                <ul className="space-y-2">{rows.map((r) => <Row key={r.station._id} row={r} onSaved={load} />)}</ul>
            )}
        </div>
    );
}
