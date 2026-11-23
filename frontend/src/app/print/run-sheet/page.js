"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import PrintShell from "@/components/print/PrintShell";
import { getStationBookings, saveProtectedFile, stationCreativeFilePath } from "@/lib/api";

// A media house's run sheet for one day: every spot by time (programme,
// length, advertiser, advert, ARCON), for the traffic / transmission team,
// plus each advert file to download once.
const lagosToday = () => new Date(Date.now() + 3600000).toISOString().slice(0, 10);

function RunSheet() {
    const params = useSearchParams();
    const [date, setDate] = useState(params.get("date") || lagosToday());
    const [state, setState] = useState({ loading: true, error: "", data: [] });
    const [msg, setMsg] = useState("");
    useEffect(() => {
        getStationBookings()
            .then((r) => setState({ loading: false, error: "", data: r.data || [] }))
            .catch((e) => setState({ loading: false, error: e?.message || "Couldn't load your spots.", data: [] }));
    }, []);
    const spots = useMemo(() => state.data
        .filter((b) => String(b.date).slice(0, 10) === date && ["PENDING", "ACCEPTED", "SCHEDULED", "COMPLETED"].includes(b.status))
        .sort((a, b) => String(a.time).localeCompare(String(b.time))), [state.data, date]);
    // One download per advert (the same advert often runs many times a day).
    const adverts = useMemo(() => {
        const m = new Map();
        for (const b of spots) if (b.creativeId && typeof b.creativeId === "object" && !m.has(b.creativeId._id)) m.set(b.creativeId._id, { creative: b.creativeId, bookingId: b._id, count: 0 });
        for (const b of spots) if (b.creativeId?._id && m.has(b.creativeId._id)) m.get(b.creativeId._id).count += 1;
        return [...m.values()];
    }, [spots]);

    if (state.loading) return <p className="p-10 text-center text-sm text-slate-500">Loading…</p>;
    if (state.error) return <p className="p-10 text-center text-sm text-red-600">{state.error}</p>;
    const stations = [...new Set(spots.map((b) => b.stationId?.name).filter(Boolean))];

    return (
        <PrintShell title={`Run sheet ${date}`} back="/station/requests">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                    <p className="text-2xl font-bold">Run sheet</p>
                    <p className="text-sm text-slate-600">{stations.join(", ") || "Your media house"} · {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
                </div>
                <label className="no-print text-sm text-slate-600">Day <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-1 rounded border border-slate-300 px-2 py-1" /></label>
            </div>
            {spots.length === 0 ? <p className="mt-6 text-sm text-slate-500">No spots on this day.</p> : (
                <table className="mt-5 w-full text-sm">
                    <thead className="border-b border-slate-300 text-left text-xs text-slate-500"><tr><th className="py-2 font-medium">Time</th><th className="py-2 font-medium">Programme</th><th className="py-2 font-medium">Length</th><th className="py-2 font-medium">Advertiser · campaign</th><th className="py-2 font-medium">Advert</th><th className="py-2 font-medium">Status</th><th className="py-2 font-medium">✓</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {spots.map((b) => (
                            <tr key={b._id}>
                                <td className="py-2 font-mono">{b.time}</td>
                                <td className="py-2">{b.rateName || b.slot}</td>
                                <td className="py-2">{b.spotSeconds ? `${b.spotSeconds}s` : "—"}</td>
                                <td className="py-2">{b.companyId?.name || b.userId?.name || "Advertiser"}<span className="block text-xs text-slate-500">{b.campaignId?.name}</span></td>
                                <td className="py-2">{b.creativeId?.name || "—"}{b.creativeId?.arcon?.certificateNumber ? <span className="block text-xs text-slate-500">ARCON {b.creativeId.arcon.certificateNumber}</span> : null}</td>
                                <td className="py-2 text-xs">{b.status === "PENDING" ? "Not accepted yet" : b.status === "COMPLETED" ? "Aired" : b.status === "SCHEDULED" ? "Scheduled" : "Accepted"}</td>
                                <td className="py-2"><span className="inline-block h-4 w-4 border border-slate-400" /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {adverts.length > 0 && (
                <div className="no-print mt-8">
                    <h2 className="font-semibold">Adverts for this day ({adverts.length})</h2>
                    <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {adverts.map((a) => (
                            <li key={a.creative._id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                <span>{a.creative.name}{a.creative.durationSeconds ? ` · ${a.creative.durationSeconds}s` : ""} <span className="text-xs text-slate-500">({a.count} spot{a.count === 1 ? "" : "s"})</span></span>
                                <button type="button" onClick={() => saveProtectedFile(stationCreativeFilePath(a.bookingId), a.creative.fileName || a.creative.name).catch((e) => setMsg(e.message))} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white"><Download className="h-3.5 w-3.5" /> Download</button>
                            </li>
                        ))}
                    </ul>
                    {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
                </div>
            )}
        </PrintShell>
    );
}

export default function RunSheetPage() {
    return <Suspense fallback={null}><RunSheet /></Suspense>;
}
