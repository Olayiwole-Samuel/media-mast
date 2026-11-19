"use client";

import { useCallback, useEffect, useState } from "react";
import { Percent, Search } from "lucide-react";
import { getAdminVolumeAgreements } from "@/lib/api";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Every agency's volume discount with each media house: entered by the agency,
// confirmed (or not) by the media house. Read-only for admins.

const BADGE = {
    PENDING: ["Waiting for the media house", "bg-amber-500/15 text-amber-300"],
    APPROVED: ["Confirmed", "bg-emerald-500/15 text-emerald-300"],
    REJECTED: ["Rejected", "bg-red-500/15 text-red-300"],
};

export default function AdminDiscountsPage() {
    const [state, setState] = useState({ loading: true, error: null, data: [] });
    const [query, setQuery] = useState("");
    const load = useCallback(async () => {
        try {
            const res = await getAdminVolumeAgreements();
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
    const rows = state.data.filter((a) => !q || `${a.agencyName} ${a.stationName}`.toLowerCase().includes(q));

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Percent className="h-6 w-6 text-emerald-400" /> Volume discounts</h1>
                <p className="mt-1 text-slate-400">Agencies enter the volume discount from their existing agreement with each media house; the media house confirms it. Only confirmed discounts price their plans.</p>
            </div>
            <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agency or media house" className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white focus:border-emerald-500 focus:outline-none" />
            </div>
            {rows.length === 0 ? <EmptyState icon={Percent} title="No volume discounts yet" message="They appear here when agencies enter them." /> : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="bg-white/5 text-xs text-slate-400">
                            <tr><th className="px-4 py-3 font-medium">Agency</th><th className="px-4 py-3 font-medium">Media house</th><th className="px-4 py-3 text-right font-medium">Discount</th><th className="px-4 py-3 font-medium">By programme</th><th className="px-4 py-3 font-medium">Status</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                            {rows.map((a) => (
                                <tr key={a._id}>
                                    <td className="px-4 py-3">{a.agencyName}</td>
                                    <td className="px-4 py-3">{a.stationName}</td>
                                    <td className="px-4 py-3 text-right font-semibold">{a.percent}%</td>
                                    <td className="px-4 py-3 text-xs text-slate-400">{(a.programmes || []).map((p) => `${p.name} ${p.percent}%`).join(", ") || "—"}</td>
                                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[a.status][1]}`}>{BADGE[a.status][0]}</span>{a.status === "REJECTED" && a.stationNote ? <span className="block text-xs text-slate-500">{a.stationNote}</span> : null}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
