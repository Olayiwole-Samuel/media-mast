"use client";

import { formatMoney } from "@/lib/status";

// A station's rate card as the admin sees it: one row per belt or programme,
// a column per spot length (press: one price per placement).

const LENGTHS = [60, 45, 30, 15];

export default function StationRateCardTable({ station }) {
    const rates = (station.rateCard || []).filter(Boolean);
    const currency = station.pricing?.currency || "NGN";

    if (!rates.length) {
        return <p className="text-sm text-slate-400">No rates yet. This station can&apos;t be booked until it publishes its rate card.</p>;
    }

    const groups = new Map();
    for (const r of rates) {
        const key = [r.name, r.kind, r.startTime || "", r.endTime || "", r.size || "", r.colour || ""].join("|");
        if (!groups.has(key)) groups.set(key, { ...r, prices: {}, single: null, offered: false });
        const g = groups.get(key);
        if (r.spotSeconds && LENGTHS.includes(r.spotSeconds)) g.prices[r.spotSeconds] = r.price;
        else g.single = r.price;
        if (r.isActive !== false) g.offered = true;
    }
    const rows = [...groups.values()];
    const hasLengths = rows.some((g) => Object.keys(g.prices).length);

    return (
        <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="bg-white/5 text-slate-400">
                    <tr>
                        <th className="px-3 py-2 font-medium">Belt / programme</th>
                        <th className="px-3 py-2 font-medium">When</th>
                        {hasLengths ? LENGTHS.map((l) => <th key={l} className="px-3 py-2 text-right font-medium">{l}s</th>) : <th className="px-3 py-2 text-right font-medium">Price</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {rows.map((g) => (
                        <tr key={`${g.name}-${g.startTime}-${g.size}`} className={g.offered ? "" : "opacity-50"}>
                            <td className="px-3 py-2 text-slate-200">{g.name}{g.code ? <span className="ml-1 text-slate-500">({g.code})</span> : null}</td>
                            <td className="px-3 py-2 text-slate-400">
                                {g.kind === "TIME_BELT" && g.startTime ? `${g.startTime}–${g.endTime}` : g.size ? `${g.size}${g.colour === "BLACK_WHITE" ? " · B&W" : " · colour"}` : "In programme"}
                            </td>
                            {hasLengths
                                ? LENGTHS.map((l) => (
                                    <td key={l} className="px-3 py-2 text-right text-slate-100">{g.prices[l] ? formatMoney(g.prices[l], currency) : <span className="text-slate-600">—</span>}</td>
                                ))
                                : <td className="px-3 py-2 text-right text-slate-100">{formatMoney(g.single ?? g.price, currency)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
