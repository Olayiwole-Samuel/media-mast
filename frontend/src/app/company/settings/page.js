"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Settings, Loader2, Check } from "lucide-react";
import { getCompanySettings, updateCompanySettings } from "@/lib/api";
import { PageLoading, ApiErrorState } from "@/components/common/PageState";
import NotificationPreferences from "@/components/settings/NotificationPreferences";

// Company settings (GET / PUT /settings — Company Owner only on the backend).
// Only changed fields are sent.

const FIELDS = [
    { name: "name", label: "Company name", type: "text", required: true },
    { name: "email", label: "Company email", type: "email", required: true },
    { name: "phone", label: "Phone number", type: "tel" },
    { name: "website", label: "Website", type: "url", placeholder: "https://" },
    { name: "address", label: "Street address", type: "text" },
    { name: "city", label: "City", type: "text" },
    { name: "state", label: "State", type: "text" },
    { name: "country", label: "Country", type: "text" },
];

const EDITABLE = [...FIELDS.map((f) => f.name), "description"];

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const toForm = (company) => Object.fromEntries(EDITABLE.map((k) => [k, company?.[k] ?? ""]));

export default function CompanySettingsPage() {
    const [company, setCompany] = useState(null);
    const [form, setForm] = useState(toForm(null));
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const result = await getCompanySettings();
            setCompany(result?.data || null);
            setForm(toForm(result?.data));
        } catch (err) {
            setLoadError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const changes = Object.fromEntries(
        EDITABLE.filter((k) => String(form[k] ?? "").trim() !== String(company?.[k] ?? "").trim()).map((k) => [k, String(form[k]).trim() || null])
    );
    const dirty = Object.keys(changes).length > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setNotice(null);
        if (!dirty) return;
        if (!String(form.name).trim() || !String(form.email).trim()) {
            return setNotice({ type: "error", text: "Company name and email can't be empty." });
        }

        setSaving(true);
        try {
            const result = await updateCompanySettings(changes);
            setCompany((prev) => ({ ...prev, ...(result?.data || {}) }));
            setForm(toForm({ ...company, ...(result?.data || {}) }));
            setNotice({ type: "success", text: "Company details saved." });
        } catch (err) {
            setNotice({
                type: "error",
                text: err?.status === 403 ? "Only the company owner can change company settings." : err?.message || "We couldn't save your changes.",
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <PageLoading label="Loading company settings…" />;

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <Settings className="h-6 w-6 text-emerald-500" />
                    Company settings
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">Your company&apos;s details as stations and the Media Masters team see them.</p>
            </motion.div>

            {loadError ? (
                <ApiErrorState error={loadError} what="company settings" onRetry={load} />
            ) : (
                <form onSubmit={handleSubmit} className="max-w-3xl space-y-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    {notice && (
                        <div
                            className={`rounded-lg border p-3 text-sm ${
                                notice.type === "success"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                                    : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                            }`}
                        >
                            {notice.text}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {FIELDS.map((field) => (
                            <label key={field.name} className="block">
                                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{field.label}</span>
                                <input
                                    type={field.type}
                                    name={field.name}
                                    value={form[field.name] ?? ""}
                                    onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                                    placeholder={field.placeholder}
                                    required={field.required}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>

                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">About your company</span>
                        <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={`${inputClass} resize-none`} />
                    </label>

                    <dl className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3 dark:bg-slate-800">
                        <div>
                            <dt className="text-slate-500 dark:text-slate-400">Account status</dt>
                            <dd className="font-medium text-slate-900 dark:text-white">{company?.status === "APPROVED" ? "Approved" : company?.status}</dd>
                        </div>
                        <div>
                            <dt className="text-slate-500 dark:text-slate-400">Currency</dt>
                            <dd className="font-medium text-slate-900 dark:text-white">{company?.currency || "NGN"}</dd>
                        </div>
                        <div>
                            <dt className="text-slate-500 dark:text-slate-400">Time zone</dt>
                            <dd className="font-medium text-slate-900 dark:text-white">{company?.timezone || "Africa/Lagos"}</dd>
                        </div>
                    </dl>

                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setForm(toForm(company))} disabled={!dirty || saving} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800">
                            Undo changes
                        </button>
                        <button type="submit" disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Save changes
                        </button>
                    </div>
                </form>
            )}

            <div className="mt-6 max-w-3xl">
                <NotificationPreferences />
            </div>
        </div>
    );
}
