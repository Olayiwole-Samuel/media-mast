"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Check, X, Trash2, Pencil, Play, FileText, ShieldCheck, Upload, Film, Image as ImageIcon, Music } from "lucide-react";
import {
    getCreatives,
    createCreative,
    updateCreative,
    approveCreative,
    rejectCreative,
    deleteCreative,
    uploadFileInParts,
    fetchFileUrl,
    saveProtectedFile,
    creativeFilePath,
} from "@/lib/api";
import { creativeStatus } from "@/lib/status";

// A campaign's adverts. Each advert is the file itself (video, image or audio,
// up to 100 MB) uploaded to Media Masters, together with its ARCON approval:
// the certificate number and a copy of the certificate. Stations air exactly
// this file, so no links are taken. Uploads by someone who can approve
// adverts are ready at once; other team members' uploads wait for approval.

const ACCEPT_ADVERT = "video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp4,audio/wav,audio/aac,.mp4,.mov,.webm,.jpg,.jpeg,.png,.webp,.gif,.mp3,.m4a,.wav,.aac";
const ACCEPT_CERT = "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";
const MAX_ADVERT = 100 * 1024 * 1024;

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white";

const friendly = (err, action) =>
    err?.status === 403 ? `You don't have permission to ${action}.` : err?.message || `We couldn't ${action}.`;

const sizeLabel = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const typeIcon = (type) => (type === "VIDEO" ? Film : type === "AUDIO" ? Music : ImageIcon);
const baseName = (name) => String(name || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

// Length of a video/audio file, read in the browser (null if it can't be read).
const mediaSeconds = (file) => new Promise((resolve) => {
    if (!/^(video|audio)\//.test(file.type)) return resolve(null);
    const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    const url = URL.createObjectURL(file);
    const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.max(1, Math.round(el.duration)) : null);
    el.onerror = () => done(null);
    el.src = url;
});

const EMPTY = { name: "", description: "", advert: null, seconds: "", arconNumber: "", arconFile: null };

function Preview({ creative }) {
    const [url, setUrl] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

    if (!creative.fileId) return null;
    if (!url) {
        return (
            <button type="button" disabled={busy} onClick={async () => {
                setBusy(true); setError("");
                try { setUrl(await fetchFileUrl(creativeFilePath(creative._id))); } catch (err) { setError(err.message); } finally { setBusy(false); }
            }} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {creative.type === "IMAGE" ? "View" : "Play"}
                {error && <span className="ml-1 text-red-300">{error}</span>}
            </button>
        );
    }
    if (creative.type === "VIDEO") return <video src={url} controls className="mt-2 max-h-64 w-full rounded-lg bg-black" />;
    if (creative.type === "AUDIO") return <audio src={url} controls className="mt-2 w-full" />;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={creative.name} className="mt-2 max-h-64 rounded-lg object-contain" />;
}

export default function CampaignCreatives({ campaignId }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [actionError, setActionError] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [progress, setProgress] = useState(null);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const advertRef = useRef(null);
    const certRef = useRef(null);

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

    const pickAdvert = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_ADVERT) {
            setActionError("Adverts can be at most 100 MB.");
            return;
        }
        setActionError("");
        const seconds = await mediaSeconds(file);
        setForm((f) => ({ ...f, advert: file, name: f.name || baseName(file.name), seconds: seconds ? String(seconds) : f.seconds }));
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        setActionError("");
        if (!form.advert) return setActionError("Choose the advert file (video, image or audio).");
        if (!form.name.trim()) return setActionError("Give the advert a name.");
        if (!form.arconNumber.trim()) return setActionError("Enter the ARCON approval certificate number.");
        if (!form.arconFile) return setActionError("Attach the ARCON approval certificate (PDF or photo).");

        setSaving(true);
        try {
            // The advert is the big part of the progress bar; the certificate is small.
            const advert = await uploadFileInParts(form.advert, "CREATIVE", (p) => setProgress(p * 0.9));
            const cert = await uploadFileInParts(form.arconFile, "ARCON", (p) => setProgress(0.9 + p * 0.1));
            const result = await createCreative({
                campaignId,
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                durationSeconds: form.seconds ? Number(form.seconds) : undefined,
                uploadId: advert.uploadId,
                arconCertificateNumber: form.arconNumber.trim(),
                arconUploadId: cert.uploadId,
            });
            setItems((prev) => [result.data, ...prev]);
            setForm(EMPTY);
            setAdding(false);
        } catch (err) {
            setActionError(friendly(err, "upload this advert"));
        } finally {
            setSaving(false);
            setProgress(null);
        }
    };

    const handleEditSave = async (e) => {
        e.preventDefault();
        if (!editing.name.trim()) return;
        await run(editing._id, "edit adverts", async () => {
            const result = await updateCreative(editing._id, { name: editing.name.trim(), description: editing.description });
            replace(result.data);
            setEditing(null);
        });
    };

    if (loading) {
        return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-500" /></div>;
    }

    if (loadError) {
        return (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {loadError.status === 403 ? "You don't have permission to view adverts." : `We couldn't load adverts. ${loadError.message || ""}`}
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {actionError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{actionError}</p>
            )}

            {items.length === 0 && !adding && (
                <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    No adverts yet. Upload the advert with its ARCON certificate before booking airtime.
                </p>
            )}

            {items.map((creative) => {
                const badge = creativeStatus(creative.status);
                const busy = busyId === creative._id;
                const Icon = typeIcon(creative.type);

                if (editing?._id === creative._id) {
                    return (
                        <form key={creative._id} onSubmit={handleEditSave} className="space-y-2 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                            <input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Advert name" />
                            <textarea className={`${inputClass} resize-none`} rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Description (optional)" aria-label="Advert description" />
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</button>
                                <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">Save</button>
                            </div>
                        </form>
                    );
                }

                return (
                    <div key={creative._id} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900 dark:text-white">
                                    <Icon className="h-4 w-4 shrink-0 text-slate-400" /> {creative.name}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {creative.fileName || (creative.url ? "Older advert (link only)" : "")}
                                    {creative.size ? ` · ${sizeLabel(creative.size)}` : ""}
                                    {creative.durationSeconds ? ` · ${creative.durationSeconds}s` : ""}
                                </p>
                                {creative.arcon?.certificateNumber ? (
                                    <button type="button" onClick={() => saveProtectedFile(creativeFilePath(creative._id, "arcon"), creative.arcon.fileName || "arcon-certificate").catch((err) => setActionError(err.message))}
                                        className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:underline dark:bg-emerald-500/15 dark:text-emerald-300">
                                        <ShieldCheck className="h-3 w-3" /> ARCON {creative.arcon.certificateNumber} <FileText className="h-3 w-3" />
                                    </button>
                                ) : (
                                    <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">No ARCON certificate — cannot be booked</span>
                                )}
                                {creative.description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{creative.description}</p>}
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{creative.status === "APPROVED" ? "Ready to book" : badge.label}</span>
                        </div>

                        <Preview creative={creative} />

                        <div className="mt-3 flex flex-wrap gap-2">
                            {creative.status === "PENDING" && (
                                <>
                                    <button type="button" disabled={busy} onClick={() => run(creative._id, "approve adverts", async () => replace((await approveCreative(creative._id)).data))}
                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                                        <Check className="h-3.5 w-3.5" /> Approve
                                    </button>
                                    <button type="button" disabled={busy} onClick={() => run(creative._id, "reject adverts", async () => replace((await rejectCreative(creative._id)).data))}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
                                        <X className="h-3.5 w-3.5" /> Reject
                                    </button>
                                </>
                            )}
                            <button type="button" disabled={busy} onClick={() => setEditing({ _id: creative._id, name: creative.name, description: creative.description || "" })}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-700">
                                <Pencil className="h-3.5 w-3.5" /> Rename
                            </button>
                            <button type="button" disabled={busy} onClick={() => {
                                if (!window.confirm(`Delete "${creative.name}"? This can't be undone.`)) return;
                                run(creative._id, "delete adverts", async () => {
                                    await deleteCreative(creative._id);
                                    setItems((prev) => prev.filter((c) => c._id !== creative._id));
                                });
                            }} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-500/10">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                            {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-emerald-500" />}
                        </div>
                    </div>
                );
            })}

            {adding ? (
                <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div>
                        <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">1. The advert</p>
                        <button type="button" onClick={() => advertRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600 hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-600 dark:text-slate-300">
                            <Upload className="h-4 w-4" />
                            {form.advert ? `${form.advert.name} · ${sizeLabel(form.advert.size)}` : "Choose the video, image or audio file (up to 100 MB)"}
                        </button>
                        <input ref={advertRef} type="file" accept={ACCEPT_ADVERT} className="hidden" onChange={pickAdvert} />
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input className={`${inputClass} sm:col-span-2`} placeholder="Advert name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Advert name" />
                        <input className={inputClass} type="number" min="1" max="3600" placeholder="Length (seconds)" value={form.seconds} onChange={(e) => setForm({ ...form, seconds: e.target.value })} aria-label="Advert length in seconds" />
                    </div>
                    <div>
                        <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">2. ARCON approval (required for every advert)</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input className={inputClass} placeholder="ARCON certificate number" value={form.arconNumber} onChange={(e) => setForm({ ...form, arconNumber: e.target.value })} aria-label="ARCON certificate number" maxLength={60} />
                            <button type="button" onClick={() => certRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                {form.arconFile ? form.arconFile.name : "Attach the certificate (PDF or photo)"}
                            </button>
                            <input ref={certRef} type="file" accept={ACCEPT_CERT} className="hidden" onChange={(e) => setForm({ ...form, arconFile: e.target.files?.[0] || null })} />
                        </div>
                    </div>
                    <textarea className={`${inputClass} resize-none`} rows={2} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label="Description" />

                    {progress !== null && (
                        <div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-slate-500">Uploading… {Math.round(progress * 100)}%</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <button type="button" disabled={saving} onClick={() => { setAdding(false); setForm(EMPTY); }} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                        <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60">
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Upload advert
                        </button>
                    </div>
                </form>
            ) : (
                <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-600 dark:text-slate-300">
                    <Plus className="h-4 w-4" /> Upload advert
                </button>
            )}
        </div>
    );
}
