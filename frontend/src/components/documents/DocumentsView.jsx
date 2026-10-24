"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FolderOpen, Upload, Download, Trash2, Loader2, FileText } from "lucide-react";
import { getMyDocuments, uploadDocument, downloadDocument, deleteDocument } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { advertiserPaths } from "@/lib/cart";
import { formatDate } from "@/lib/status";
import { PageLoading, ApiErrorState } from "@/components/common/PageState";

// The advertiser's cloud space: creatives, briefs, contracts, invoices.
// Space comes with the plan; files up to 4 MB each.

const formatBytes = (b) => {
    const n = Number(b) || 0;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(1, Math.ceil(n / 1024))} KB`;
};

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.mp3,.wav,.mp4,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";

export default function DocumentsView() {
    const { user } = useSession();
    const paths = advertiserPaths(user);
    const inputRef = useRef(null);
    const [docs, setDocs] = useState([]);
    const [storage, setStorage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getMyDocuments();
            setDocs(res?.data || []);
            setStorage(res?.storage || null);
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

    const onFiles = async (files) => {
        const list = Array.from(files || []);
        if (!list.length) return;
        setNotice(null);
        for (const file of list) {
            if (storage?.maxFileBytes && file.size > storage.maxFileBytes) {
                setNotice({ type: "error", text: `${file.name} is larger than ${formatBytes(storage.maxFileBytes)}.` });
                continue;
            }
            setBusy("upload");
            try {
                await uploadDocument(file);
                setNotice({ type: "success", text: `${file.name} uploaded.` });
            } catch (err) {
                setNotice({ type: "error", text: `${file.name}: ${err.message}` });
            }
        }
        setBusy(null);
        if (inputRef.current) inputRef.current.value = "";
        await load();
    };

    const remove = async (doc) => {
        if (!window.confirm(`Delete ${doc.name}? This can't be undone.`)) return;
        setBusy(doc._id);
        try {
            await deleteDocument(doc._id);
            await load();
        } catch (err) {
            setNotice({ type: "error", text: err.message });
        } finally {
            setBusy(null);
        }
    };

    const download = async (doc) => {
        setBusy(doc._id);
        try {
            await downloadDocument(doc._id, doc.name);
        } catch (err) {
            setNotice({ type: "error", text: err.message });
        } finally {
            setBusy(null);
        }
    };

    if (loading) return <PageLoading label="Loading your documents…" />;
    if (error) return <ApiErrorState error={error} what="your documents" onRetry={load} />;

    const quota = storage?.quotaBytes || 0;
    const used = storage?.usedBytes || 0;
    const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;

    return (
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                        <FolderOpen className="h-6 w-6 text-emerald-500" /> Documents
                    </h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">Keep creatives, briefs, contracts and invoices in one place.</p>
                </div>
                {quota > 0 && (
                    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy === "upload"} className="inline-flex items-center gap-2 self-start rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
                        {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload files
                    </button>
                )}
                <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </motion.div>

            {notice && (
                <div className={`rounded-xl border p-3 text-sm ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"}`} role="status">
                    {notice.text}
                </div>
            )}

            {quota > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-300">{formatBytes(used)} of {formatBytes(quota)} used</span>
                        <span className="text-slate-500 dark:text-slate-400">{storage?.planName} plan · files up to {formatBytes(storage?.maxFileBytes)}</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <p className="font-semibold text-slate-900 dark:text-white">Document storage comes with a plan</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Every plan includes cloud space for your files.</p>
                    <Link href={paths.subscription} className="mt-3 inline-flex text-sm font-medium text-emerald-600 dark:text-emerald-400">Choose a plan →</Link>
                </div>
            )}

            {quota > 0 && (
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
                    className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400"
                >
                    Drag files here, or use Upload files. PDF, images, audio, video, Office, text, CSV and ZIP.
                </div>
            )}

            {docs.length > 0 && (
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {docs.map((d) => (
                        <li key={d._id} className="flex items-center justify-between gap-3 px-5 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{d.name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatBytes(d.size)} · {formatDate(d.uploadedAt)}</p>
                                </div>
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <button type="button" onClick={() => download(d)} disabled={busy === d._id} aria-label={`Download ${d.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                                    <Download className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => remove(d)} disabled={busy === d._id} aria-label={`Delete ${d.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
