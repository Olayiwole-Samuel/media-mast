"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Check, X, Trash2, Pencil, ExternalLink } from "lucide-react";
import {
    getCreatives,
    uploadCreative,
    updateCreative,
    approveCreative,
    rejectCreative,
    deleteCreative,
} from "@/lib/api";
import { creativeStatus } from "@/lib/status";

// Creatives for one campaign.
//   list      GET    /creatives/campaign/:id   CREATIVE_VIEW
//   add       POST   /creatives                CREATIVE_UPLOAD
//   edit      PUT    /creatives/:id            CREATIVE_UPLOAD  (name + description only)
//   approve   PATCH  /creatives/:id/approve    CREATIVE_APPROVE
//   reject    PATCH  /creatives/:id/reject     CREATIVE_APPROVE
//   delete    DELETE /creatives/:id            CREATIVE_DELETE
// Status is never sent through edit. File upload/storage doesn't exist on the
// backend yet, so a creative is added as a link to the file.

const TYPES = [
    { value: "IMAGE", label: "Image" },
    { value: "VIDEO", label: "Video" },
    { value: "AUDIO", label: "Audio" },
    { value: "DOCUMENT", label: "Document" },
    { value: "OTHER", label: "Other" },
];

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

const friendly = (err, action) =>
    err?.status === 403 ? `You don't have permission to ${action}.` : err?.message || `We couldn't ${action}.`;

const isSafeLink = (url) => /^https?:\/\//i.test(String(url || ""));

export default function CampaignCreatives({ campaignId }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [actionError, setActionError] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: "", type: "IMAGE", url: "", description: "" });

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const result = await getCreatives(campaignId);
            setItems(result?.data || []);
        } catch (err) {
            setLoadError(err);
        } finally {
            setLoading(false);
        }
    }, [campaignId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const replace = (updated) => setItems((prev) => prev.map((c) => (c._id === updated._id ? { ...c, ...updated } : c)));

    const run = async (id, action, fn) => {
        setActionError("");
        setBusyId(id);
        try {
            await fn();
        } catch (err) {
            setActionError(friendly(err, action));
        } finally {
            setBusyId(null);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        setActionError("");
        if (!form.name.trim() || !isSafeLink(form.url)) {
            setActionError("Please give the creative a name and a link that starts with http:// or https://.");
            return;
        }
        setSaving(true);
        try {
            const result = await uploadCreative({
                campaignId,
                name: form.name.trim(),
                type: form.type,
                url: form.url.trim(),
                description: form.description.trim() || undefined,
            });
            setItems((prev) => [result.data, ...prev]);
            setForm({ name: "", type: "IMAGE", url: "", description: "" });
            setAdding(false);
        } catch (err) {
            setActionError(friendly(err, "add creatives"));
        } finally {
            setSaving(false);
        }
    };

    const handleEditSave = async (e) => {
        e.preventDefault();
        if (!editing.name.trim()) return;
        await run(editing._id, "edit creatives", async () => {
            const result = await updateCreative(editing._id, {
                name: editing.name.trim(),
                description: editing.description,
            });
            replace(result.data);
            setEditing(null);
        });
    };

    if (loading) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
            </div>
        );
    }

    if (loadError) {
        return (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {loadError.status === 403
                    ? "You don't have permission to view creatives."
                    : `We couldn't load creatives. ${loadError.message || ""}`}
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {actionError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                    {actionError}
                </p>
            )}

            {items.length === 0 && !adding && (
                <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    No creatives added yet.
                </p>
            )}

            {items.map((creative) => {
                const badge = creativeStatus(creative.status);
                const busy = busyId === creative._id;

                if (editing?._id === creative._id) {
                    return (
                        <form key={creative._id} onSubmit={handleEditSave} className="space-y-2 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                            <input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Creative name" />
                            <textarea
                                className={`${inputClass} resize-none`}
                                rows={2}
                                value={editing.description || ""}
                                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                                placeholder="Description (optional)"
                                aria-label="Creative description"
                            />
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700">
                                    Cancel
                                </button>
                                <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                                    Save
                                </button>
                            </div>
                        </form>
                    );
                }

                return (
                    <div key={creative._id} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{creative.name}</p>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {TYPES.find((t) => t.value === creative.type)?.label || creative.type}
                                    {isSafeLink(creative.url) && (
                                        <>
                                            {" · "}
                                            <a href={creative.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-emerald-600 hover:underline dark:text-emerald-400">
                                                Open file <ExternalLink className="h-3 w-3" />
                                            </a>
                                        </>
                                    )}
                                </p>
                                {creative.description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{creative.description}</p>}
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            {creative.status !== "APPROVED" && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => run(creative._id, "approve creatives", async () => replace((await approveCreative(creative._id)).data))}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
                                >
                                    <Check className="h-3.5 w-3.5" /> Approve
                                </button>
                            )}
                            {creative.status !== "REJECTED" && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => run(creative._id, "reject creatives", async () => replace((await rejectCreative(creative._id)).data))}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                                >
                                    <X className="h-3.5 w-3.5" /> Reject
                                </button>
                            )}
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setEditing({ _id: creative._id, name: creative.name, description: creative.description || "" })}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                    if (!window.confirm(`Delete "${creative.name}"? This can't be undone.`)) return;
                                    run(creative._id, "delete creatives", async () => {
                                        await deleteCreative(creative._id);
                                        setItems((prev) => prev.filter((c) => c._id !== creative._id));
                                    });
                                }}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-500/10"
                            >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                            {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-emerald-500" />}
                        </div>
                    </div>
                );
            })}

            {adding ? (
                <form onSubmit={handleAdd} className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input className={`${inputClass} sm:col-span-2`} placeholder="Creative name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Creative name" />
                        <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Creative type">
                            {TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <input className={inputClass} placeholder="Link to the file (https://…)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} aria-label="Link to the file" />
                    <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label="Description" />
                    <p className="text-xs text-slate-400">File uploads aren&apos;t available yet, so add a link to where the file is stored.</p>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add creative
                        </button>
                    </div>
                </form>
            ) : (
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-600 dark:text-slate-300"
                >
                    <Plus className="h-4 w-4" /> Add creative
                </button>
            )}
        </div>
    );
}
