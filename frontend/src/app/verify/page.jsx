"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
    BadgeCheck, CheckCircle2, Clock, FileText, Loader2, LogOut, RefreshCw, Send, ShieldCheck, Trash2, Upload, XCircle,
} from "lucide-react";
import {
    getMe, getMyVerification, saveMyVerification, addVerificationDocument, removeVerificationDocument,
    saveVerificationRateCard, submitMyVerification, uploadFileInParts, saveProtectedFile,
} from "@/lib/api";
import { useSession, saveSession, signOut, ACCOUNT_HOME } from "@/lib/auth";
import RateCardEditor from "@/components/station/RateCardEditor";

// Verification: the one page a new business sees until an admin approves it.
//   1. Business details: CAC registration number, TIN (+ ARCON number for agencies)
//   2. Documents: CAC certificate (+ rate card for media houses), optional extras
//   3. Media houses: their rates, entered once (bookings are priced from them)
//   4. Submit → under review → approved (straight into the dashboard) or
//      sent back with a reason (fix and submit again).

const KIND_TITLE = { CLIENT: "media client", AGENCY: "media agency", MEDIA_HOUSE: "media house" };

const DOC_LABEL = {
    CAC_CERTIFICATE: { title: "CAC certificate", hint: "Certificate of incorporation or business name registration (PDF or photo)." },
    RATE_CARD: { title: "Rate card", hint: "Your current rate card as published (PDF, image, Word or Excel)." },
    TAX_CERTIFICATE: { title: "Tax (TIN) certificate", hint: "Optional: FIRS TIN certificate or tax clearance." },
    ARCON_CERTIFICATE: { title: "ARCON registration", hint: "Optional: your ARCON practitioner/agency registration." },
    BROADCAST_LICENCE: { title: "Broadcast licence", hint: "Optional: NBC licence or publishing permit." },
};

const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-[3px] focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-500";

const sizeLabel = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Step({ n, title, done, children }) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="flex items-center gap-2.5 font-semibold text-slate-900">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : n}
                </span>
                {title}
            </h2>
            <div className="mt-4">{children}</div>
        </section>
    );
}

function DocumentSlot({ kind, required, doc, disabled, onUpload, onRemove, onOpen }) {
    const inputRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState("");
    const label = DOC_LABEL[kind] || { title: kind, hint: "" };

    const pick = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setError("");
        setBusy(true);
        setProgress(0);
        try {
            await onUpload(kind, file, setProgress);
        } catch (err) {
            setError(err?.message || "Upload failed. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                    {label.title} {required ? <span className="text-red-500">*</span> : <span className="text-xs font-normal text-slate-400">(optional)</span>}
                </p>
                {doc ? (
                    <button type="button" onClick={() => onOpen(doc)} className="mt-0.5 flex max-w-full items-center gap-1.5 truncate text-xs text-emerald-700 hover:underline">
                        <FileText className="h-3.5 w-3.5 shrink-0" /> {doc.name} · {sizeLabel(doc.size)}
                    </button>
                ) : (
                    <p className="mt-0.5 text-xs text-slate-500">{label.hint}</p>
                )}
                {busy && (
                    <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                )}
                {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
            </div>
            {!disabled && (
                <div className="flex shrink-0 gap-2">
                    {doc && (
                        <button type="button" onClick={() => onRemove(doc)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {doc ? "Replace" : "Upload"}
                    </button>
                    <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={pick} />
                </div>
            )}
        </div>
    );
}

export default function VerifyPage() {
    const { ready, user, hasToken } = useSession();
    const [v, setV] = useState(null);
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState(null);

    const apply = useCallback((data) => {
        setV(data);
        setDetails({
            businessName: data.businessName || "",
            registrationNumber: data.registrationNumber || "",
            taxId: data.taxId || "",
            arconNumber: data.arconNumber || "",
            address: data.address || "",
            phone: data.phone || "",
        });
    }, []);

    const load = useCallback(async () => {
        setLoadError("");
        try {
            const res = await getMyVerification();
            apply(res.data);
        } catch (err) {
            setLoadError(err?.message || "We couldn't load your verification.");
        } finally {
            setLoading(false);
        }
    }, [apply]);

    useEffect(() => {
        if (!ready) return;
        if (!hasToken) {
            window.location.assign("/login");
            return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [ready, hasToken, load]);

    // Once approved, refresh the stored account (status ACTIVE) and open the dashboard.
    const enter = useCallback(async () => {
        try {
            const me = await getMe();
            const token = localStorage.getItem("token");
            const fresh = { ...user, status: me?.data?.status || "ACTIVE" };
            saveSession(token, fresh);
            window.location.assign(ACCOUNT_HOME[fresh.accountType] || "/");
        } catch {
            window.location.assign("/login");
        }
    }, [user]);

    // While under review, check now and then so approval opens the dashboard without signing in again.
    useEffect(() => {
        if (v?.status !== "SUBMITTED") return undefined;
        const id = setInterval(() => {
            getMyVerification().then((res) => { if (res?.data?.status !== "SUBMITTED") apply(res.data); }).catch(() => {});
        }, 30000);
        return () => clearInterval(id);
    }, [v?.status, apply]);

    if (!ready || loading) {
        return <div className="flex min-h-screen items-center justify-center bg-slate-100"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;
    }
    if (loadError || !v) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
                <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow">
                    <p className="text-sm text-slate-600">{loadError || "There is no verification for this account."}</p>
                    <div className="mt-4 flex justify-center gap-2">
                        <button type="button" onClick={load} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Try again</button>
                        <button type="button" onClick={signOut} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Sign out</button>
                    </div>
                </div>
            </div>
        );
    }

    const editable = v.status === "DRAFT" || v.status === "REJECTED";
    const isMediaHouse = v.accountKind === "MEDIA_HOUSE";
    const docOf = (kind) => v.documents.find((d) => d.kind === kind);
    const detailsDone = !!(v.registrationNumber && v.taxId && v.businessName);
    const docsDone = v.requirements.documents.every((k) => docOf(k));
    const ratesDone = !isMediaHouse || (v.station?.rateCard || []).some((r) => r.isActive !== false);

    const setField = (k) => (e) => setDetails((d) => ({ ...d, [k]: e.target.value }));

    const saveDetails = async (e) => {
        e?.preventDefault();
        setSaving(true);
        setNotice(null);
        try {
            const res = await saveMyVerification(details);
            apply(res.data);
            setNotice({ ok: true, text: "Details saved." });
        } catch (err) {
            setNotice({ ok: false, text: err?.message || "We couldn't save your details." });
        } finally {
            setSaving(false);
        }
    };

    const uploadDoc = async (kind, file, onProgress) => {
        const done = await uploadFileInParts(file, "VERIFICATION", onProgress);
        const res = await addVerificationDocument(kind, done.uploadId);
        apply(res.data);
    };
    const removeDoc = async (doc) => {
        try {
            const res = await removeVerificationDocument(doc._id);
            apply(res.data);
        } catch (err) {
            setNotice({ ok: false, text: err?.message || "We couldn't remove that document." });
        }
    };
    const openDoc = (doc) => saveProtectedFile(`/api/v1/verification/documents/${doc._id}/file`, doc.name).catch((err) => setNotice({ ok: false, text: err.message }));

    const submit = async () => {
        setSubmitting(true);
        setNotice(null);
        try {
            // Unsaved edits to the details go with the submission.
            if (editable) {
                const saved = await saveMyVerification(details);
                apply(saved.data);
            }
            const res = await submitMyVerification();
            apply(res.data);
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (err) {
            setNotice({ ok: false, text: err?.message || "We couldn't submit. Please try again." });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 px-4 py-8 sm:py-12">
            <div className="mx-auto max-w-3xl space-y-5">
                <header className="flex items-start justify-between gap-4">
                    <div>
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                            <ShieldCheck className="h-4 w-4" /> Account verification
                        </p>
                        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{v.businessName || "Your business"}</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Signed up as a {KIND_TITLE[v.accountKind]}. Every business on Media Masters is verified before it can {isMediaHouse ? "sell airtime" : "book airtime"}.
                        </p>
                    </div>
                    <button type="button" onClick={signOut} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white">
                        <LogOut className="h-4 w-4" /> Sign out
                    </button>
                </header>

                {v.status === "SUBMITTED" && (
                    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <Clock className="mt-0.5 h-5 w-5 shrink-0" />
                        <div className="flex-1">
                            <p className="font-semibold">Under review</p>
                            <p className="mt-0.5">Our team is checking your details. We&apos;ll email you and this page will open your dashboard as soon as you&apos;re approved.</p>
                        </div>
                        <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium hover:bg-amber-100"><RefreshCw className="h-3.5 w-3.5" /> Check</button>
                    </div>
                )}
                {v.status === "REJECTED" && (
                    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                            <p className="font-semibold">Please fix and resubmit</p>
                            <p className="mt-0.5">{v.reviewNote}</p>
                        </div>
                    </div>
                )}
                {v.status === "APPROVED" && (
                    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-center gap-2 font-semibold"><BadgeCheck className="h-5 w-5" /> You&apos;re verified.</p>
                        <button type="button" onClick={enter} className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600">
                            Open your dashboard
                        </button>
                    </div>
                )}

                {notice && (
                    <div role="status" className={`rounded-xl border p-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}`}>{notice.text}</div>
                )}

                <Step n={1} title="Business details" done={detailsDone}>
                    <form onSubmit={saveDetails} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="sm:col-span-2">
                            <span className="mb-1 block text-xs font-medium text-slate-600">Registered business name</span>
                            <input value={details.businessName} onChange={setField("businessName")} disabled={!editable} maxLength={150} className={inputClass} />
                        </label>
                        <label>
                            <span className="mb-1 block text-xs font-medium text-slate-600">CAC registration number</span>
                            <input value={details.registrationNumber} onChange={setField("registrationNumber")} disabled={!editable} placeholder="RC 1234567 or BN 1234567" className={`${inputClass} uppercase`} />
                        </label>
                        <label>
                            <span className="mb-1 block text-xs font-medium text-slate-600">Tax Identification Number (TIN)</span>
                            <input value={details.taxId} onChange={setField("taxId")} disabled={!editable} placeholder="12345678-0001" className={inputClass} />
                        </label>
                        {v.accountKind === "AGENCY" && (
                            <label className="sm:col-span-2">
                                <span className="mb-1 block text-xs font-medium text-slate-600">ARCON registration number <span className="font-normal text-slate-400">(optional — agencies registered with ARCON earn agency commission)</span></span>
                                <input value={details.arconNumber} onChange={setField("arconNumber")} disabled={!editable} maxLength={40} className={inputClass} />
                            </label>
                        )}
                        <label>
                            <span className="mb-1 block text-xs font-medium text-slate-600">Business address <span className="font-normal text-slate-400">(optional)</span></span>
                            <input value={details.address} onChange={setField("address")} disabled={!editable} maxLength={200} className={inputClass} />
                        </label>
                        <label>
                            <span className="mb-1 block text-xs font-medium text-slate-600">Phone <span className="font-normal text-slate-400">(optional)</span></span>
                            <input value={details.phone} onChange={setField("phone")} disabled={!editable} className={inputClass} />
                        </label>
                        {editable && (
                            <div className="sm:col-span-2">
                                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60">
                                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save details
                                </button>
                            </div>
                        )}
                    </form>
                </Step>

                <Step n={2} title="Documents" done={docsDone}>
                    <div className="space-y-2">
                        {[...v.requirements.documents, ...v.requirements.optionalDocuments].map((kind) => (
                            <DocumentSlot
                                key={kind}
                                kind={kind}
                                required={v.requirements.documents.includes(kind)}
                                doc={docOf(kind)}
                                disabled={!editable}
                                onUpload={uploadDoc}
                                onRemove={removeDoc}
                                onOpen={openDoc}
                            />
                        ))}
                    </div>
                </Step>

                {isMediaHouse && v.station && (
                    <Step n={3} title="Your rates" done={ratesDone}>
                        <p className="mb-3 text-sm text-slate-500">
                            Enter the prices from your rate card. Advertisers book from these, and our team compares them with the rate card you uploaded.
                        </p>
                        {editable ? (
                            <RateCardEditor
                                compact
                                title={`${v.station.name} rates`}
                                station={v.station}
                                saveRates={async (rates) => {
                                    const res = await saveVerificationRateCard(rates);
                                    apply(res.data);
                                    return res.data.station?.rateCard || [];
                                }}
                            />
                        ) : (
                            <p className="text-sm text-slate-600">{(v.station.rateCard || []).length} rates entered.</p>
                        )}
                    </Step>
                )}

                {editable && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                        {v.missing.length > 0 ? (
                            <p className="text-sm text-slate-600">
                                <span className="font-medium text-slate-900">Still needed:</span> {v.missing.join(" · ")}
                            </p>
                        ) : (
                            <p className="text-sm text-emerald-700">Everything is in. Send it for review.</p>
                        )}
                        <button type="button" onClick={submit} disabled={submitting} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 sm:w-auto">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {v.status === "REJECTED" ? "Resubmit for review" : "Submit for review"}
                        </button>
                    </section>
                )}

                <p className="text-center text-xs text-slate-400">
                    Questions? <Link href="/#contact" className="underline">Contact Media Masters</Link>
                </p>
            </div>
        </div>
    );
}
