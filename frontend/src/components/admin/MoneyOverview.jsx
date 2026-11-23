"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/status";
import { getAdminMoneyOverview } from "@/lib/api";

// Where the money is (held / spent / refunded / owed to media houses) and
// what needs attention (disputes, payouts, late confirmations, discounts).
export default function MoneyOverview() {
    const [d, setD] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => { getAdminMoneyOverview().then((r) => setD(r.data)).catch((e) => setError(e?.message || "Couldn't load the overview.")); }, []);
    if (error) return <p className="text-sm text-red-400">{error}</p>;
    if (!d) return <p className="text-sm text-slate-400">Loading money overview…</p>;
    const card = (label, value, hint) => (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-semibold text-white">{value}</p>
            {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
    );
    const attention = [
        { n: d.openDisputes, label: "open disputes", href: "/admin/settlement" },
        { n: d.pendingPayouts, label: "payout requests", href: "/admin/settlement?tab=payouts" },
        { n: d.lateConfirmations.count, label: "spots not confirmed in time", href: "/admin/bookings" },
        { n: d.pendingAgreements, label: "volume discounts waiting for media houses", href: "/admin/discounts" },
    ];
    const list = (title, rows) => (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="mb-2 text-sm font-medium text-white">{title}</p>
            {rows.length === 0 ? <p className="text-xs text-slate-500">Nothing yet.</p> : (
                <ol className="space-y-1 text-sm">{rows.map((r, i) => <li key={r.name} className="flex justify-between gap-3 text-slate-300"><span className="truncate">{i + 1}. {r.name}</span><span className="shrink-0 text-white">{typeof r.value === "number" && r.value > 1000 ? formatMoney(r.value) : r.value}</span></li>)}</ol>
            )}
        </div>
    );
    return (
        <section className="space-y-4 rounded-2xl bg-slate-950 p-5 text-white">
            <h2 className="text-lg font-semibold text-white">Money &amp; operations</h2>
            <div className="flex flex-wrap gap-2">
                {attention.map((a) => (
                    <Link key={a.label} href={a.href} className={`rounded-full px-3 py-1.5 text-xs font-medium ${a.n ? "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30" : "bg-white/5 text-slate-400"}`}>{a.n} {a.label}</Link>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {card("Held for upcoming spots", formatMoney(d.advertisers.held), "Advertisers' money, not yet aired")}
                {card("Spent (aired)", formatMoney(d.advertisers.spent), `Refunded ${formatMoney(d.advertisers.refunded)}`)}
                {card("In advertiser wallets", formatMoney(d.advertisers.available), `Funded in total ${formatMoney(d.advertisers.funded)}`)}
                {card("Owed to media houses", formatMoney(d.mediaHouses.available), `Earned ${formatMoney(d.mediaHouses.earned)} · paid out ${formatMoney(d.mediaHouses.paidOut)}`)}
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {list("Top agencies & brands (booked)", d.topAgencies)}
                {list("Top media houses (earned)", d.topStations)}
                {list("Late confirming", d.lateConfirmations.byStation)}
            </div>
        </section>
    );
}
