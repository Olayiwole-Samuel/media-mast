"use client";

import { Printer, ArrowLeft } from "lucide-react";

// A clean, printable page (no sidebar). "Print / Save as PDF" uses the
// browser's print dialog; the toolbar is hidden on paper.
export default function PrintShell({ title, children, back }) {
    return (
        <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
            <style>{"@media print { .no-print { display: none !important; } @page { margin: 14mm; } }"}</style>
            <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between px-4">
                <button type="button" onClick={() => (back ? window.location.assign(back) : window.history.back())} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back</button>
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Printer className="h-4 w-4" /> Print / Save as PDF</button>
            </div>
            <article aria-label={title} className="mx-auto max-w-4xl bg-white p-8 text-slate-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
                {children}
            </article>
        </div>
    );
}
