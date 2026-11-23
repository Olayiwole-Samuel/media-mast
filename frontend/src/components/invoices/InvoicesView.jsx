"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Receipt, Undo2 } from "lucide-react";
import { getInvoices } from "@/lib/api";
import { formatMoney } from "@/lib/status";
import { EmptyState } from "@/components/common/PageState";

// Tax invoices (booked plans), receipts (wallet top-ups) and credit notes
// (refunds), each printable / saveable as PDF for the accounts team.

const KIND = {
    invoice: { label: "Tax invoice", icon: FileText, tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
    receipt: { label: "Receipt", icon: Receipt, tone: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" },
    credit: { label: "Credit note", icon: Undo2, tone: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300" },
};

export default function InvoicesView() {
    const [state, setState] = useState({ loading: true, error: "", data: [] });
    const [filter, setFilter] = useState("");
    useEffect(() => {
        getInvoices().then((r) => setState({ loading: false, error: "", data: r.data || [] })).catch((e) => setState({ loading: false, error: e?.message || "Couldn't load your documents.", data: [] }));
    }, []);
    const rows = state.data.filter((d) => !filter || d.kind === filter);
    return (
        <div className="space-y-6">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white"><FileText className="h-6 w-6 text-emerald-500" /> Invoices & receipts</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">A tax invoice for every plan you book, a receipt for every wallet top-up, and a credit note for every refund. Open one to print or save it as PDF.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {[["", "All"], ["invoice", "Invoices"], ["receipt", "Receipts"], ["credit", "Credit notes"]].map(([v, l]) => (
                    <button key={l} type="button" onClick={() => setFilter(v)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === v ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{l}</button>
                ))}
            </div>
            {state.loading ? <p className="text-sm text-slate-500"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading…</p>
                : state.error ? <p className="text-sm text-red-600">{state.error}</p>
                    : rows.length === 0 ? <EmptyState icon={FileText} title="Nothing yet" message="Documents appear here when you fund your wallet or book a plan." />
                        : (
                            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                                {rows.map((d) => {
                                    const k = KIND[d.kind];
                                    return (
                                        <li key={`${d.kind}-${d.id}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${k.tone}`}><k.icon className="h-4 w-4" /></span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{k.label} · {d.title}</p>
                                                    <p className="truncate text-xs text-slate-500">{d.number} · {new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatMoney(d.amount)}</span>
                                                <Link href={`/print/invoice?kind=${d.kind}&id=${d.id}`} target="_blank" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">Open</Link>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
        </div>
    );
}
