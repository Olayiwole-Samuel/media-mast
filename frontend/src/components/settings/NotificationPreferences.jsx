"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2, Check } from "lucide-react";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/api";

// Opt-in alert when a new station goes live, optionally only in chosen
// states. Booking, payment, reminder and cancellation notices always send.

export default function NotificationPreferences() {
    const [prefs, setPrefs] = useState(null);
    const [states, setStates] = useState([]);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        let live = true;
        getNotificationPreferences()
            .then((res) => {
                if (!live) return;
                setPrefs({ notifyNewStations: !!res?.data?.notifyNewStations, notifyStates: res?.data?.notifyStates || [] });
                setStates(res?.data?.states || []);
            })
            .catch((err) => live && setError(err?.message || "Couldn't load your alert settings."));
        return () => { live = false; };
    }, []);

    const toggleState = (st) => {
        setSaved(false);
        setPrefs((p) => ({ ...p, notifyStates: p.notifyStates.includes(st) ? p.notifyStates.filter((x) => x !== st) : [...p.notifyStates, st] }));
    };

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            await updateNotificationPreferences(prefs);
            setSaved(true);
        } catch (err) {
            setError(err?.message || "Couldn't save your alert settings.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <Bell className="h-5 w-5 text-emerald-500" /> Notifications
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Booking confirmations, payments, cancellations and slot reminders (24 hours and 1 hour before) are always sent to you in the app, by email and by SMS where available.
            </p>

            {!prefs && !error && <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}

            {prefs && (
                <div className="mt-4 space-y-4">
                    <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                        <input type="checkbox" className="mt-0.5" checked={prefs.notifyNewStations} onChange={(e) => { setSaved(false); setPrefs({ ...prefs, notifyNewStations: e.target.checked }); }} />
                        <span>
                            Tell me when a new station joins
                            <span className="block text-xs text-slate-400">Choose states below to hear only about those; leave them all unticked for anywhere in Nigeria.</span>
                        </span>
                    </label>

                    {prefs.notifyNewStations && (
                        <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">
                            {states.map((st) => (
                                <label key={st} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                    <input type="checkbox" checked={prefs.notifyStates.includes(st)} onChange={() => toggleState(st)} /> {st}
                                </label>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save alerts
                        </button>
                        {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>}
                    </div>
                </div>
            )}

            {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
        </section>
    );
}
