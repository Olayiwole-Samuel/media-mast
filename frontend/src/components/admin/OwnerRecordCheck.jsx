"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, Loader2, Wrench } from "lucide-react";
import { checkCompanyOwnerRecord, repairCompanyOwnerRecord } from "@/lib/api";

// Shows whether the company owner's owner record is right (the owner can't
// use owner features without it) and offers the server's safe repair when
// one exists. Hidden while everything is fine.
export default function OwnerRecordCheck({ companyId }) {
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [repairing, setRepairing] = useState(false);
    const [notice, setNotice] = useState("");

    const load = useCallback(async () => {
        if (!companyId) return;
        try {
            const res = await checkCompanyOwnerRecord(companyId);
            setResult(res.data);
            setError("");
        } catch (err) {
            setError(err.message || "Could not check the owner record.");
        }
    }, [companyId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const repair = async () => {
        if (!window.confirm("Repair this company's owner record? This is recorded in the audit log.")) return;
        setRepairing(true);
        setError("");
        try {
            const res = await repairCompanyOwnerRecord(companyId);
            setResult(res.data);
            setNotice(res.message || "Owner record repaired.");
        } catch (err) {
            setError(err.message || "The repair failed.");
            if (err.data?.data) setResult(err.data.data);
        } finally {
            setRepairing(false);
        }
    };

    if (!result && !error) return null;
    if (result?.status === "OK" && !notice && !error) return null;

    const healthy = result?.status === "OK";

    return (
        <section
            className={`mt-5 flex flex-col gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
                healthy ? "border-emerald-400/20 bg-emerald-400/[0.06]" : "border-amber-400/25 bg-amber-400/[0.07]"
            }`}
            aria-live="polite"
        >
            <div className="flex items-start gap-3">
                {healthy
                    ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />}
                <div className="min-w-0">
                    <p className={`text-sm font-semibold ${healthy ? "text-emerald-300" : "text-amber-300"}`}>
                        {healthy ? "Owner record OK" : "Owner record needs attention"}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-400">{notice || result?.description || error}</p>
                    {error && result && <p className="mt-1 text-sm text-red-400">{error}</p>}
                    {result?.owner && (
                        <p className="mt-1 break-all text-xs text-slate-500">Owner account: {result.owner.name} · {result.owner.email}</p>
                    )}
                </div>
            </div>
            {result?.repairable && (
                <button
                    type="button"
                    onClick={repair}
                    disabled={repairing}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
                >
                    {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                    {result.status === "INACTIVE_OWNER_RECORD" ? "Reactivate owner record" : "Create owner record"}
                </button>
            )}
        </section>
    );
}
