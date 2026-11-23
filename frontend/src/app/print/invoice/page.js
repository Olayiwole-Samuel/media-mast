"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PrintShell from "@/components/print/PrintShell";
import { getInvoice } from "@/lib/api";
import { formatMoney } from "@/lib/status";

// Tax invoice (a booked plan), receipt (wallet top-up) or credit note (refund).
const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function Invoice() {
    const params = useSearchParams();
    const [state, setState] = useState({ loading: true, error: "", data: null });
    useEffect(() => {
        getInvoice(params.get("kind"), params.get("id"))
            .then((r) => setState({ loading: false, error: "", data: r.data }))
            .catch((e) => setState({ loading: false, error: e?.message || "Couldn't load the document.", data: null }));
    }, [params]);
    if (state.loading) return <p className="p-10 text-center text-sm text-slate-500">Loading…</p>;
    if (state.error) return <p className="p-10 text-center text-sm text-red-600">{state.error}</p>;
    const d = state.data;
    return (
        <PrintShell title={`${d.title} ${d.number}`}>
            <div className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
                <div>
                    <p className="text-2xl font-bold">{d.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{d.number} · {fmtDate(d.date)}</p>
                    {d.campaign && <p className="mt-1 text-sm text-slate-500">Campaign: {d.campaign.name}{d.campaign.clientBrand ? ` (${d.campaign.clientBrand})` : ""}</p>}
                </div>
                <div className="text-right text-sm">
                    <p className="font-semibold">{d.seller.name}</p>
                    <p className="text-slate-500">{d.seller.address}</p>
                    {d.seller.tin && <p className="text-slate-500">TIN {d.seller.tin}</p>}
                    {d.seller.email && <p className="text-slate-500">{d.seller.email}</p>}
                </div>
            </div>
            <div className="mt-6 text-sm">
                <p className="text-xs uppercase tracking-wide text-slate-400">Billed to</p>
                <p className="mt-1 font-semibold">{d.billedTo.name}</p>
                {d.billedTo.address && <p className="text-slate-600">{d.billedTo.address}</p>}
                <p className="text-slate-600">{[d.billedTo.tin ? `TIN ${d.billedTo.tin}` : null, d.billedTo.rcNumber ? `RC ${d.billedTo.rcNumber}` : null, d.billedTo.email].filter(Boolean).join(" · ")}</p>
            </div>
            <table className="mt-6 w-full text-sm">
                <thead className="border-b border-slate-300 text-left text-xs text-slate-500">
                    <tr><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium">Qty</th><th className="py-2 text-right font-medium">Rate card</th><th className="py-2 text-right font-medium">Net</th><th className="py-2 text-right font-medium">VAT</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {d.items.map((it, i) => (
                        <tr key={i}>
                            <td className="py-2">{it.description}{it.first ? <span className="block text-xs text-slate-500">{it.first === it.last ? it.first : `${it.first} to ${it.last}`}</span> : null}</td>
                            <td className="py-2 text-right">{it.qty}</td>
                            <td className="py-2 text-right">{it.gross != null ? formatMoney(it.gross) : "—"}</td>
                            <td className="py-2 text-right">{it.net != null ? formatMoney(it.net) : "—"}</td>
                            <td className="py-2 text-right">{it.vat != null ? formatMoney(it.vat) : "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <dl className="ml-auto mt-6 w-full max-w-xs space-y-1 text-sm">
                {d.totals.gross != null && <div className="flex justify-between"><dt>Rate card value</dt><dd>{formatMoney(d.totals.gross)}</dd></div>}
                {d.totals.discount > 0 && <div className="flex justify-between"><dt>Discounts</dt><dd>−{formatMoney(d.totals.discount)}</dd></div>}
                {d.totals.net != null && <div className="flex justify-between"><dt>Net</dt><dd>{formatMoney(d.totals.net)}</dd></div>}
                {d.totals.vat != null && <div className="flex justify-between"><dt>VAT {d.vatPercent}%</dt><dd>{formatMoney(d.totals.vat)}</dd></div>}
                <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold"><dt>Total</dt><dd>{formatMoney(d.totals.total)}</dd></div>
                {d.totals.refunded > 0 && <div className="flex justify-between text-slate-500"><dt>Refunded since</dt><dd>{formatMoney(d.totals.refunded)}</dd></div>}
            </dl>
            {d.paidWith && <p className="mt-6 text-xs text-slate-500">Paid with: {d.paidWith}. Each media house is paid as its spots air; anything that doesn&apos;t air is refunded to the wallet (credit note).</p>}
        </PrintShell>
    );
}

export default function InvoicePrintPage() {
    return <Suspense fallback={null}><Invoice /></Suspense>;
}
