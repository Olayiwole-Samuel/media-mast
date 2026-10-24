"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Radio, Loader2, Save } from "lucide-react";
import { getMyStations, updateMyStation } from "@/lib/api";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";
import RateCardEditor from "@/components/station/RateCardEditor";

// The station's own listing (PUT /station-portal/stations/:id): profile,
// rate and availability. Name, type and approval are managed by Media
// Masters, so they're shown read-only.

const UNITS = ["SPOT", "DAY", "WEEK", "MONTH", "CAMPAIGN", "IMPRESSION", "CUSTOM"];
const AVAILABILITY = [
    { value: "AVAILABLE", label: "Taking bookings" },
    { value: "BOOKED", label: "Fully booked" },
    { value: "UNAVAILABLE", label: "Paused" },
];

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const toForm = (s) => ({
    description: s.description || "",
    phone: s.phone || "",
    email: s.email || "",
    website: s.website || "",
    logo: s.logo || "",
    coverImage: s.coverImage || "",
    address: s.location?.address || "",
    city: s.location?.city || "",
    state: s.location?.state || "",
    reach: s.reach || "",
    advertisingFormats: (s.advertisingFormats || []).join(", "),
    features: (s.features || []).join(", "),
    priceAmount: s.pricing?.amount ? String(s.pricing.amount) : "",
    priceUnit: s.pricing?.unit || "SPOT",
    inventoryStatus: ["AVAILABLE", "BOOKED", "UNAVAILABLE"].includes(s.inventoryStatus) ? s.inventoryStatus : "AVAILABLE",
});

const splitList = (text) => [...new Set(text.split(",").map((t) => t.trim()).filter(Boolean))];

function Field({ label, children, hint }) {
    return (
        <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
            {children}
            {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
        </label>
    );
}

export default function StationProfilePage() {
    const [stations, setStations] = useState([]);
    const [selectedId, setSelectedId] = useState("");
    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getMyStations();
            const list = result?.data || [];
            setStations(list);
            if (list.length) {
                setSelectedId(list[0]._id);
                setForm(toForm(list[0]));
            }
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

    const station = stations.find((s) => s._id === selectedId);

    const choose = (id) => {
        const s = stations.find((x) => x._id === id);
        setSelectedId(id);
        setForm(s ? toForm(s) : null);
        setNotice(null);
    };

    const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const handleSave = async (e) => {
        e.preventDefault();
        setNotice(null);

        const amount = Number(form.priceAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            setNotice({ type: "error", text: "Please enter a price greater than 0." });
            return;
        }

        const payload = {
            description: form.description.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            website: form.website.trim(),
            logo: form.logo.trim(),
            coverImage: form.coverImage.trim(),
            location: { address: form.address.trim(), city: form.city.trim(), state: form.state.trim() },
            reach: form.reach.trim(),
            advertisingFormats: splitList(form.advertisingFormats),
            features: splitList(form.features),
            pricing: { amount, currency: station?.pricing?.currency || "NGN", unit: form.priceUnit },
            inventoryStatus: form.inventoryStatus,
        };

        setSaving(true);
        try {
            const result = await updateMyStation(selectedId, payload);
            const saved = result?.data;
            if (saved) {
                setStations((prev) => prev.map((s) => (s._id === saved._id ? saved : s)));
                setForm(toForm(saved));
            }
            setNotice({ type: "success", text: "Your station has been updated." });
        } catch (err) {
            setNotice({ type: "error", text: err?.message || "We couldn't save your changes." });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <PageLoading label="Loading your station…" />;
    if (error) return <div className="p-4 sm:p-6 lg:p-8"><ApiErrorState error={error} what="your station" onRetry={load} /></div>;
    if (!station || !form) {
        return <div className="p-4 sm:p-6 lg:p-8"><EmptyState icon={Radio} title="No station found" message="Contact Media Masters if you expected to see your station here." /></div>;
    }

    return (
        <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <Radio className="h-6 w-6 text-emerald-500" />
                    My station
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">This is what advertisers see when they browse stations.</p>
            </motion.div>

            {stations.length > 1 && (
                <div className="mb-4">
                    <Field label="Station">
                        <select value={selectedId} onChange={(e) => choose(e.target.value)} className={inputClass}>
                            {stations.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                        </select>
                    </Field>
                </div>
            )}

            <div className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Name</p><p className="font-medium text-slate-900 dark:text-white">{station.name}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Type</p><p className="font-medium text-slate-900 dark:text-white">{station.type}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Status</p><p className="font-medium text-slate-900 dark:text-white">{station.approvalStatus === "APPROVED" ? (station.isActive ? "Live" : "Approved, inactive") : station.approvalStatus === "PENDING" ? "Awaiting approval" : "Not approved"}</p></div>
                <p className="text-xs text-slate-400 sm:col-span-3">To change the name or type, contact Media Masters.</p>
            </div>

            {notice && (
                <div role="status" className={`mb-4 rounded-lg border p-3 text-sm ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"}`}>
                    {notice.text}
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="font-semibold text-slate-900 dark:text-white">Rate and availability</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Field label={`Price (${station.pricing?.currency || "NGN"})`}>
                            <input type="number" min="1" step="any" value={form.priceAmount} onChange={update("priceAmount")} className={inputClass} required />
                        </Field>
                        <Field label="Per">
                            <select value={form.priceUnit} onChange={update("priceUnit")} className={inputClass}>
                                {UNITS.map((u) => <option key={u} value={u}>{u.toLowerCase()}</option>)}
                            </select>
                        </Field>
                        <Field label="Availability">
                            <select value={form.inventoryStatus} onChange={update("inventoryStatus")} className={inputClass}>
                                {AVAILABILITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                            </select>
                        </Field>
                    </div>
                    <p className="text-xs text-slate-400">New prices apply to new bookings; requests already made keep the price they were made at.</p>
                </section>

                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="font-semibold text-slate-900 dark:text-white">About your station</h2>
                    <Field label="Description">
                        <textarea rows={4} maxLength={2000} value={form.description} onChange={update("description")} className={inputClass} />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Advertising formats" hint="Comma-separated, e.g. 30s spot, jingle, live read"><input value={form.advertisingFormats} onChange={update("advertisingFormats")} className={inputClass} /></Field>
                        <Field label="Features" hint="Comma-separated"><input value={form.features} onChange={update("features")} className={inputClass} /></Field>
                        <Field label="Reach / audience"><input maxLength={200} value={form.reach} onChange={update("reach")} className={inputClass} placeholder="e.g. 2M weekly listeners, Lagos" /></Field>
                        <Field label="Website"><input value={form.website} onChange={update("website")} className={inputClass} placeholder="https://" /></Field>
                        <Field label="Logo URL"><input value={form.logo} onChange={update("logo")} className={inputClass} placeholder="https://" /></Field>
                        <Field label="Cover image URL"><input value={form.coverImage} onChange={update("coverImage")} className={inputClass} placeholder="https://" /></Field>
                    </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="font-semibold text-slate-900 dark:text-white">Location and contact</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Address"><input maxLength={200} value={form.address} onChange={update("address")} className={inputClass} /></Field>
                        <Field label="City"><input maxLength={100} value={form.city} onChange={update("city")} className={inputClass} /></Field>
                        <Field label="State"><input maxLength={100} value={form.state} onChange={update("state")} className={inputClass} /></Field>
                        <Field label="Bookings phone"><input value={form.phone} onChange={update("phone")} className={inputClass} /></Field>
                        <Field label="Bookings email"><input type="email" value={form.email} onChange={update("email")} className={inputClass} /></Field>
                    </div>
                </section>

                <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600 disabled:opacity-60 sm:w-auto">
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    {saving ? "Saving…" : "Save changes"}
                </button>
            </form>

            <div className="mt-6">
                <RateCardEditor
                    key={station._id}
                    station={station}
                    onSaved={(rateCard) => setStations((prev) => prev.map((s) => (s._id === station._id ? { ...s, rateCard } : s)))}
                />
            </div>
        </div>
    );
}
