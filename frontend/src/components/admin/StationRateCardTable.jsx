"use client";

import { formatMoney } from "@/lib/status";
import { daysLabel } from "@/lib/rates";

// A station's rate card as the admin sees it: one row per belt or programme,
// a column per spot length that the card uses (press: one price per placement).

export default function StationRateCardTable({ station }) {
    const rates = (station.rateCard || []).filter(Boolean);
    const currency = station.pricing?.currency || "NGN";

    if (!rates.length) {
        return <p className="text-sm text-slate-400">No rates yet. This station can&apos;t be booked until it publishes its rate card.</p>;
    }

    const lengths = [...new Set(rates.map((r) => r.spotSeconds).filter(Boolean))].sort((a, b) => b - a);
    const groups = new Map();
    for (const r of rates) {
        const key = [r.name, r.kind, r.startTime || "", r.endTime || "", r.size || "", r.colour || "", (r.days || []).join("")].join("|");
        if (!groups.has(key)) groups.set(key, { ...r, prices: {}, single: null, offered: false });
        const g = groups.get(key);
        if (r.spotSeconds) g.prices[r.spotSeconds] = r.price;
        else g.single = r.price;
        if (r.isActive !== false) g.offered = true;
    }
    const rows = [...groups.values()];
    const hasLengths = lengths.length > 0;
    const hasSingles = rows.some((g) => g.single != null);

    return (
        <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="bg-white/5 text-slate-400">
                    <tr>
                        <th className="px-3 py-2 font-medium">Belt / programme / placement</th>
                        <th className="px-3 py-2 font-medium">When</th>
                        {lengths.map((l) => <th key={l} className="px-3 py-2 text-right font-medium">{l}s</th>)}
                        {(!hasLengths || hasSingles) && <th className="px-3 py-2 text-right font-medium">Price</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {rows.map((g) => {
                        const when = g.kind === "TIME_BELT" && g.startTime
                            ? `${g.startTime}–${g.endTime}`
                            : g.size ? `${g.size}${g.colour === "BLACK_WHITE" ? " · B&W" : " · colour"}` : "In programme";
                        const days = daysLabel(g.days);
                        return (
                            <tr key={`${g.name}-${g.startTime}-${g.size}-${g.colour}-${(g.days || []).join("")}`} className={g.offered ? "" : "opacity-50"}>
                                <td className="px-3 py-2 text-slate-200">{g.name}{g.code ? <span className="ml-1 text-slate-500">({g.code})</span> : null}</td>
                                <td className="px-3 py-2 text-slate-400">{when}{days ? ` · ${days}` : ""}</td>
                                {lengths.map((l) => (
                                    <td key={l} className="px-3 py-2 text-right text-slate-100">{g.prices[l] ? formatMoney(g.prices[l], currency) : <span className="text-slate-600">—</span>}</td>
                                ))}
                                {(!hasLengths || hasSingles) && (
                                    <td className="px-3 py-2 text-right text-slate-100">{g.single != null ? formatMoney(g.single, currency) : <span className="text-slate-600">—</span>}</td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
