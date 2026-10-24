"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { UserCog, Plus, Loader2, X, Radio } from "lucide-react";
import { getStationManagers, createStationManager, updateStationManager, getAdminStations } from "@/lib/api";
import { formatDate } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Station managers run the station desk (bookings, rates, calendar) for the
// stations they're assigned to. Only admins create them; they sign in with
// the temporary password and must change it, and can't open the admin area.

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

function StationPicker({ stations, selected, onChange }) {
    const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    return (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            {stations.length === 0 && <p className="p-2 text-sm text-slate-500">No stations yet. Add stations first.</p>}
            {stations.map((s) => (
                <label key={s._id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input type="checkbox" checked={selected.includes(s._id)} onChange={() => toggle(s._id)} />
                    <span className="text-slate-900 dark:text-white">{s.name}</span>
                    <span className="text-xs text-slate-400">{s.type}</span>
                </label>
            ))}
        </div>
    );
}

export default function StationManagersPage() {
    const [managers, setManagers] = useState([]);
    const [stations, setStations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", password: "", stationIds: [] });
    const [editing, setEditing] = useState(null); // { id, stationIds }
    const [busy, setBusy] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [m, s] = await Promise.all([getStationManagers(), getAdminStations()]);
            setManagers(m?.data || []);
            setStations(s?.data || []);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const create = async (e) => {
        e.preventDefault();
        setBusy("create");
        setNotice(null);
        try {
            await createStationManager(form);
            setNotice({ type: "success", text: `${form.name} can now sign in with the temporary password and will be asked to change it.` });
            setForm({ name: "", email: "", password: "", stationIds: [] });
            setCreating(false);
            await load();
        } catch (err) {
            setNotice({ type: "error", text: err?.message || "We couldn't create this manager." });
        } finally {
            setBusy("");
        }
    };

    const saveStations = async () => {
        setBusy(editing.id);
        setNotice(null);
        try {
            await updateStationManager(editing.id, { stationIds: editing.stationIds });
            setNotice({ type: "success", text: "Station assignments updated." });
            setEditing(null);
            await load();
        } catch (err) {
            setNotice({ type: "error", text: err?.message || "We couldn't update the assignments." });
        } finally {
            setBusy("");
        }
    };

    const toggleStatus = async (m) => {
        const next = m.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
        if (next === "SUSPENDED" && !window.confirm(`Suspend ${m.name}? They'll be signed out and lose access to the station desk.`)) return;
        setBusy(m._id);
        setNotice(null);
        try {
            await updateStationManager(m._id, { status: next });
            setNotice({ type: "success", text: next === "SUSPENDED" ? `${m.name} has been suspended.` : `${m.name} can sign in again.` });
            await load();
        } catch (err) {
            setNotice({ type: "error", text: err?.message || "We couldn't change their status." });
        } finally {
            setBusy("");
        }
    };

    if (loading) return <PageLoading label="Loading station managers…" />;
    if (error) return <div className="p-4 sm:p-6 lg:p-8"><ApiErrorState error={error} what="station managers" onRetry={load} /></div>;

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                        <UserCog className="h-6 w-6 text-emerald-500" />
                        Station managers
                    </h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">People who run the station desk for their assigned stations: booking requests, rates and calendar.</p>
                </div>
                <button type="button" onClick={() => setCreating((v) => !v)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                    {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {creating ? "Close" : "Add manager"}
                </button>
            </motion.div>

            {notice && (
                <div role="status" className={`rounded-lg border p-3 text-sm ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"}`}>
                    {notice.text}
                </div>
            )}

            {creating && (
                <form onSubmit={create} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Name</span>
                            <input required maxLength={100} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
                        </label>
                        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Email</span>
                            <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputClass} />
                        </label>
                        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Temporary password</span>
                            <input required type="text" autoComplete="new-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className={inputClass} />
                            <span className="mt-1 block text-xs text-slate-400">8+ characters with upper and lower case, a number and a symbol.</span>
                        </label>
                    </div>
                    <div>
                        <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Stations they manage</p>
                        <StationPicker stations={stations} selected={form.stationIds} onChange={(ids) => setForm((f) => ({ ...f, stationIds: ids }))} />
                    </div>
                    <button type="submit" disabled={busy === "create"} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                        {busy === "create" && <Loader2 className="h-4 w-4 animate-spin" />} Create manager
                    </button>
                </form>
            )}

            {managers.length === 0 ? (
                <EmptyState icon={UserCog} title="No station managers yet" message="Add a manager and assign them to the stations they'll run." />
            ) : (
                <ul className="space-y-3">
                    {managers.map((m) => (
                        <li key={m._id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 dark:text-white">{m.name} <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${m.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{m.status === "ACTIVE" ? "Active" : "Suspended"}</span></p>
                                    <p className="truncate text-sm text-slate-500">{m.email} · {m.lastLogin ? `last signed in ${formatDate(m.lastLogin)}` : "never signed in"}</p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {m.stations.length === 0 ? <span className="text-xs text-amber-600">No stations assigned</span> : m.stations.map((s) => (
                                            <span key={s._id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Radio className="h-3 w-3" />{s.name}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <button type="button" onClick={() => setEditing(editing?.id === m._id ? null : { id: m._id, stationIds: m.stations.map((s) => s._id) })} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                                        Stations
                                    </button>
                                    <button type="button" onClick={() => toggleStatus(m)} disabled={busy === m._id} className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${m.status === "ACTIVE" ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"}`}>
                                        {m.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                                    </button>
                                </div>
                            </div>
                            {editing?.id === m._id && (
                                <div className="mt-4 space-y-3">
                                    <StationPicker stations={stations} selected={editing.stationIds} onChange={(ids) => setEditing((ed) => ({ ...ed, stationIds: ids }))} />
                                    <button type="button" onClick={saveStations} disabled={busy === m._id} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                                        {busy === m._id && <Loader2 className="h-4 w-4 animate-spin" />} Save assignments
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
