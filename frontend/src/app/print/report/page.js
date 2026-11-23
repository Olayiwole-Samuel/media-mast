"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PrintShell from "@/components/print/PrintShell";
import { getCampaignReport, fetchFileUrl, bookingProofPath } from "@/lib/api";
import { formatMoney } from "@/lib/status";

// Proof-of-airing report for the client: per media house, spots planned and
// aired, and every aired spot with its TX log and clip.
const fmt = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

function Report() {
    const params = useSearchParams();
    const [state, setState] = useState({ loading: true, error: "", data: null });
    useEffect(() => {
        getCampaignReport(params.get("id"))
            .then((r) => setState({ loading: false, error: "", data: r.data }))
            .catch((e) => setState({ loading: false, error: e?.message || "Couldn't build the report.", data: null }));
    }, [params]);
    const open = async (id, which) => {
        const tab = window.open("about:blank", "_blank");
        try { const url = await fetchFileUrl(bookingProofPath(id, which)); if (tab) tab.location.href = url; } catch { tab?.close(); }
    };
    if (state.loading) return <p className="p-10 text-center text-sm text-slate-500">Building the report…</p>;
    if (state.error) return <p className="p-10 text-center text-sm text-red-600">{state.error}</p>;
    const { campaign, owner, stations, spots, generatedAt } = state.data;
    const t = stations.reduce((a, s) => ({ planned: a.planned + s.planned, aired: a.aired + s.aired, notAired: a.notAired + s.notAired, spent: a.spent + s.spent }), { planned: 0, aired: 0, notAired: 0, spent: 0 });
    return (
        <PrintShell title={`Airing report ${campaign.name}`}>
            <div className="border-b border-slate-200 pb-5">
                <p className="text-2xl font-bold">Proof-of-airing report</p>
                <p className="mt-1 text-sm text-slate-600">{campaign.name}{campaign.clientBrand ? ` · ${campaign.clientBrand}` : ""} · {owner}</p>
                <p className="text-sm text-slate-500">{fmt(campaign.startDate)} to {fmt(campaign.endDate)} · generated {new Date(generatedAt).toLocaleString("en-GB")}</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[["Spots planned", t.planned], ["Aired", t.aired], ["Not aired (refunded)", t.notAired], ["Paid to media houses", formatMoney(t.spent)]].map(([l, v]) => (
                    <div key={l} className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">{l}</p><p className="text-lg font-bold">{v}</p></div>
                ))}
            </div>
            <h2 className="mt-6 font-semibold">By media house</h2>
            <table className="mt-2 w-full text-sm">
                <thead className="border-b border-slate-300 text-left text-xs text-slate-500"><tr><th className="py-2 font-medium">Media house</th><th className="py-2 text-right font-medium">Planned</th><th className="py-2 text-right font-medium">Aired</th><th className="py-2 text-right font-medium">Not aired</th><th className="py-2 text-right font-medium">Cancelled</th><th className="py-2 text-right font-medium">Upcoming</th><th className="py-2 text-right font-medium">Paid</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                    {stations.map((s) => <tr key={s.station}><td className="py-2">{s.station}</td><td className="py-2 text-right">{s.planned}</td><td className="py-2 text-right">{s.aired}</td><td className="py-2 text-right">{s.notAired}</td><td className="py-2 text-right">{s.cancelled}</td><td className="py-2 text-right">{s.upcoming}</td><td className="py-2 text-right">{formatMoney(s.spent)}</td></tr>)}
                </tbody>
            </table>
            <h2 className="mt-6 font-semibold">Spots confirmed</h2>
            {spots.length === 0 ? <p className="mt-2 text-sm text-slate-500">No spots have aired yet.</p> : (
                <table className="mt-2 w-full text-xs">
                    <thead className="border-b border-slate-300 text-left text-slate-500"><tr><th className="py-1.5 font-medium">Date</th><th className="py-1.5 font-medium">Media house</th><th className="py-1.5 font-medium">Programme</th><th className="py-1.5 font-medium">Status</th><th className="py-1.5 font-medium">Proof</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                        {spots.map((s) => (
                            <tr key={s._id}>
                                <td className="py-1.5">{fmt(s.date)} {s.time}</td>
                                <td className="py-1.5">{s.station}</td>
                                <td className="py-1.5">{s.programme}{s.spotSeconds ? ` · ${s.spotSeconds}s` : ""}</td>
                                <td className="py-1.5">{s.status === "COMPLETED" ? "Aired" : "Not aired (refunded)"}{s.note ? <span className="block text-slate-500">{s.note}</span> : null}</td>
                                <td className="py-1.5">
                                    {s.hasLog && <button type="button" onClick={() => open(s._id, "log")} className="mr-2 text-emerald-700 underline print:no-underline">TX log</button>}
                                    {s.hasClip && <button type="button" onClick={() => open(s._id, "clip")} className="text-emerald-700 underline print:no-underline">Clip</button>}
                                    {!s.hasLog && !s.hasClip && "—"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </PrintShell>
    );
}

export default function ReportPrintPage() {
    return <Suspense fallback={null}><Report /></Suspense>;
}
