"use client";

import { useCallback, useEffect, useState } from "react";
import { Percent, Loader2 } from "lucide-react";
import { getStationVolumeAgreements, decideVolumeAgreement } from "@/lib/api";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Agencies say which volume discount they have with this media house; the
// media house confirms (it then applies to their bookings) or rejects it.

const BADGE = {
    PENDING: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
    APPROVED: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
    REJECTED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};
const LABEL = { PENDING: "To confirm", APPROVED: "Confirmed", REJECTED: "Rejected" };

function Agreement({ a, onDone }) {
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const decide = async (decision) => {
        setBusy(true); setError("");
        try {
            await decideVolumeAgreement(a._id, { decision, note });
            onDone();
        } catch (err) {
            setError(err?.message || "Couldn't save.");
            setBusy(false);
        }
    };
    return (
        <li className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{a.agencyName}: {a.percent}% volume discount</p>
                    <p className="text-sm text-slate-500">{a.stationName}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[a.status]}`}>{LABEL[a.status]}</span>
            </div>
            {a.programmes?.length > 0 && (
                <ul className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {a.programmes.map((p) => <li key={p.key}>· {p.name}: {p.percent}%</li>)}
                </ul>
            )}
            {a.agencyNote && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Their note: &ldquo;{a.agencyNote}&rdquo;</p>}
            {a.status === "REJECTED" && a.stationNote && <p className="mt-2 text-sm text-red-600">Your reason: {a.stationNote}</p>}
            {a.status === "PENDING" && (
                <div className="mt-3 space-y-2">
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (needed if you reject)" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex gap-2">
                        <button type="button" disabled={busy} onClick={() => decide("APPROVE")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm</button>
                        <button type="button" disabled={busy || !note.trim()} onClick={() => decide("REJECT")} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10">Reject</button>
                    </div>
                </div>
            )}
        </li>
    );
}

export default function StationDiscountsPage() {
    const [state, setState] = useState({ loading: true, error: null, data: [] });
    const load = useCallback(async () => {
        try {
            const res = await getStationVolumeAgreements();
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
    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white"><Percent className="h-6 w-6 text-emerald-500" /> Volume discounts</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">Agencies tell us the volume discount they have with you. Confirm it if it matches your agreement; it then comes off every spot they book with you.</p>
            </div>
            {state.error ? <ApiErrorState error={state.error} onRetry={load} /> : state.data.length === 0 ? (
                <EmptyState icon={Percent} title="No volume discounts yet" message="When an agency enters its discount with you, it appears here to confirm." />
            ) : (
                <ul className="space-y-3">{state.data.map((a) => <Agreement key={a._id} a={a} onDone={load} />)}</ul>
            )}
        </div>
    );
}
