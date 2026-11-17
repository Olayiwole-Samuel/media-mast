"use client";

import { useCallback, useEffect, useState } from "react";
import { Percent, Search, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { getAdminVolumeDiscounts, setAdminVolumeDiscount } from "@/lib/api";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Volume discounts negotiated with each media house: a default % for the
// media house, and optionally a different % per programme. Media plans use
// them: rate card − volume discount − 15% agency commission (agencies) + VAT.

const inputClass = "w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-right text-sm text-white focus:border-emerald-500 focus:outline-none";

function StationDiscount({ station, onSaved }) {
    const [open, setOpen] = useState(false);
    const [percent, setPercent] = useState(String(station.percent ?? 0));
    const [programmes, setProgrammes] = useState(() => Object.fromEntries(station.programmes.map((p) => [p.key, p.percent == null ? "" : String(p.percent)])));
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const overrides = station.programmes.filter((p) => p.percent != null).length;

    const save = async () => {
        setBusy(true); setMessage(null);
        try {
            await setAdminVolumeDiscount(station._id, {
                percent: Number(percent) || 0,
                programmes: station.programmes.map((p) => ({ key: p.key, name: p.name, percent: programmes[p.key] === "" ? null : Number(programmes[p.key]) })),
            });
            setMessage({ type: "success", text: "Saved" });
            onSaved();
        } catch (err) {
            setMessage({ type: "error", text: err?.message || "Couldn't save" });
        } finally { setBusy(false); }
    };

    return (
        <li className="rounded-xl border border-white/10 bg-white/5">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{station.name}</p>
                    <p className="text-xs text-slate-400">{station.type}{station.state ? ` · ${station.state}` : ""} · {station.programmes.length} programme{station.programmes.length === 1 ? "" : "s"}{overrides ? ` · ${overrides} with their own %` : ""}</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                    Volume discount <input value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={inputClass} /> %
                </label>
                <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline">
                    By programme {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
                </button>
                {message && <span className={`text-xs ${message.type === "error" ? "text-red-400" : "text-emerald-300"}`}>{message.text}</span>}
            </div>
            {open && (
                <div className="border-t border-white/10 px-4 py-3">
                    <p className="mb-2 text-xs text-slate-400">Leave a programme empty to use the media house&apos;s {percent || 0}%.</p>
                    <ul className="divide-y divide-white/5">
                        {station.programmes.map((p) => (
                            <li key={p.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                                <span className="min-w-0 text-slate-200">{p.name}<span className="text-xs text-slate-500">{p.startTime ? ` · ${p.startTime}–${p.endTime}` : p.size ? ` · ${p.size}` : ""}{p.lengths.length ? ` · ${p.lengths.map((l) => `${l}s`).join("/")}` : ""}</span></span>
                                <span className="flex items-center gap-1 text-slate-400">
                                    <input value={programmes[p.key]} placeholder={percent || "0"} onChange={(e) => setProgrammes({ ...programmes, [p.key]: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={inputClass} /> %
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </li>
    );
}

export default function AdminDiscountsPage() {
    const [state, setState] = useState({ loading: true, error: null, data: [] });
    const [query, setQuery] = useState("");
    const load = useCallback(async () => {
        try {
            const res = await getAdminVolumeDiscounts();
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
    if (state.error) return <ApiErrorState error={state.error} onRetry={load} />;
    const q = query.trim().toLowerCase();
    const rows = state.data.filter((s) => !q || s.name.toLowerCase().includes(q));

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Percent className="h-6 w-6 text-emerald-400" /> Volume discounts</h1>
                <p className="mt-1 text-slate-400">The discount negotiated with each media house, and per programme where it differs. Media plans price every spot as: rate card − volume discount − 15% agency commission (media agencies only) = net, + 7.5% VAT.</p>
            </div>
            <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search media houses" className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white focus:border-emerald-500 focus:outline-none" />
            </div>
            {rows.length === 0 ? (
                <EmptyState icon={Percent} title="No media houses" message="Live media houses with rate cards appear here." />
            ) : (
                <ul className="space-y-2">{rows.map((s) => <StationDiscount key={s._id} station={s} onSaved={load} />)}</ul>
            )}
        </div>
    );
}
