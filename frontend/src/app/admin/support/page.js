"use client";

import { useEffect, useState } from "react";
import { Eye, Search, Loader2 } from "lucide-react";
import { getSupportAccounts, startSupportView } from "@/lib/api";

// Look at an agency's, brand's or media house's screens (read-only) to help
// them on a call. Opens in a new tab; nothing can be changed from it.

const KIND = { STATION: "Media house", INDIVIDUAL: "Brand (individual)", COMPANY: "Company" };

export default function AdminSupportPage() {
    const [query, setQuery] = useState("");
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let live = true;
        const t = setTimeout(() => {
            getSupportAccounts(query).then((r) => live && setRows(r.data || [])).catch((e) => live && setError(e?.message || "Couldn't load accounts."));
        }, 300);
        return () => { live = false; clearTimeout(t); };
    }, [query]);

    const open = async (u) => {
        setBusy(u._id); setError("");
        const tab = window.open("about:blank", "_blank");
        try {
            const res = await startSupportView(u._id);
            const payload = btoa(JSON.stringify({ token: res.data.token, user: res.data.user }));
            if (tab) tab.location.href = `/support-view#${encodeURIComponent(payload)}`;
        } catch (e) {
            tab?.close();
            setError(e?.message || "Couldn't open the support view.");
        } finally { setBusy(null); }
    };

    return (
        <div className="min-h-screen space-y-6 bg-slate-950 p-4 text-white sm:p-6 lg:p-8">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-white"><Eye className="h-6 w-6 text-violet-400" /> Support view</h1>
                <p className="mt-1 text-slate-400">See exactly what an agency, brand or media house sees, to help them on a call. It opens in a new tab, read-only, for 30 minutes. Every view is recorded in Recent activity.</p>
            </div>
            <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or company" className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white focus:border-violet-500 focus:outline-none" />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {rows === null ? <p className="text-sm text-slate-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading…</p> : rows.length === 0 ? <p className="text-sm text-slate-400">No accounts match.</p> : (
                <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
                    {rows.map((u) => (
                        <li key={u._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <p className="truncate font-medium text-white">{u.company || u.name}</p>
                                <p className="truncate text-xs text-slate-400">{u.email} · {u.companyType === "AGENCY" ? "Media agency" : u.companyType === "CLIENT" ? "Media client" : KIND[u.accountType]}{u.status !== "ACTIVE" ? ` · ${u.status.toLowerCase()}` : ""}</p>
                            </div>
                            <button type="button" disabled={busy === u._id} onClick={() => open(u)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">
                                {busy === u._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} View as
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
