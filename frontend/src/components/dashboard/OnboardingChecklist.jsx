"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X } from "lucide-react";
import { getOnboarding } from "@/lib/api";

// "Getting started": the few steps a new account needs, ticked as they are
// done. Hidden once everything is done, or when dismissed (this browser).
const KEY = "mm-onboarding-dismissed";

export default function OnboardingChecklist({ dark = false }) {
    const [steps, setSteps] = useState(null);
    const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
    useEffect(() => { if (!hidden) getOnboarding().then((r) => setSteps(r.data?.steps || [])).catch(() => setSteps([])); }, [hidden]);
    if (hidden || !steps || !steps.length || steps.every((s) => s.done)) return null;
    const done = steps.filter((s) => s.done).length;
    const dismiss = () => { try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ } setHidden(true); };
    return (
        <section className={`rounded-2xl border p-5 ${dark ? "border-white/10 bg-white/5" : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/5"}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className={`font-semibold ${dark ? "text-white" : "text-slate-900 dark:text-white"}`}>Getting started</h2>
                    <p className="text-xs text-slate-500">{done} of {steps.length} done</p>
                </div>
                <button type="button" onClick={dismiss} className="rounded-lg p-1 text-slate-400 hover:bg-black/5" aria-label="Hide the checklist"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-emerald-500" style={{ width: `${Math.round((done / steps.length) * 100)}%` }} /></div>
            <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {steps.map((s) => (
                    <li key={s.key}>
                        <Link href={s.href} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-black/5 ${s.done ? "text-slate-400 line-through" : dark ? "text-slate-200" : "text-slate-700 dark:text-slate-200"}`}>
                            {s.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className="h-4 w-4 shrink-0 text-slate-400" />} {s.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
