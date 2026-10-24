"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, Plus, Loader2, X, Check, Eye, Edit, Trash2, MoreVertical, AlertTriangle, CalendarPlus } from "lucide-react";
import {
    getCampaigns,
    getCampaign,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    updateCampaignStatus,
    getCampaignCancellationQuote,
    cancelCampaign,
} from "@/lib/api";
import {
    campaignStatus,
    bookingStatus,
    nextCampaignStatuses,
    campaignActionLabel,
    canDeleteCampaign,
    canEditCampaign,
    formatMoney,
    formatDate,
} from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";
import CampaignCreatives from "@/components/creatives/CampaignCreatives";
import BookingRequestModal from "@/components/bookings/BookingRequestModal";
import CancellationDialog from "@/components/bookings/CancellationDialog";

// Campaigns for the signed-in company (GET/POST/PUT/DELETE /campaigns,
// PATCH /campaigns/:id/status). Only status changes the backend allows from
// the current status are offered; the edit form never sends `status`.

const OBJECTIVES = [
    { value: "BRAND_AWARENESS", label: "Brand awareness" },
    { value: "PRODUCT_LAUNCH", label: "Product launch" },
    { value: "EVENT_PROMOTION", label: "Event promotion" },
    { value: "SALES", label: "Sales and offers" },
    { value: "PUBLIC_ANNOUNCEMENT", label: "Public announcement" },
];

const objectiveLabel = (value) =>
    OBJECTIVES.find((o) => o.value === value)?.label || campaignStatus(value).label;

const EMPTY_FORM = { name: "", description: "", objective: "BRAND_AWARENESS", budget: "", startDate: "", endDate: "" };

const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

const inputClass =
    "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500";

const friendly = (err, action) =>
    err?.status === 403 ? `You don't have permission to ${action}.` : err?.message || `We couldn't ${action}. Please try again.`;

function Modal({ open, onClose, busy, children, wide }) {
    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 ${wide ? "max-w-2xl" : "max-w-md p-6"}`}
                    >
                        {children}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default function CompanyCampaignsPage() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [notice, setNotice] = useState(null); // { type: "success" | "error", text }
    const [openMenu, setOpenMenu] = useState(null);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);

    const [viewing, setViewing] = useState(null);
    const [viewLoading, setViewLoading] = useState(false);
    const [bookingFor, setBookingFor] = useState(null);

    const [confirm, setConfirm] = useState(null); // { campaign, kind: "delete" | "status", status }
    const [confirming, setConfirming] = useState(false);
    const [cancelCampaignTarget, setCancelCampaignTarget] = useState(null);
    const loadCampaignQuote = useCallback(async () => (await getCampaignCancellationQuote(cancelCampaignTarget._id))?.data, [cancelCampaignTarget]);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const result = await getCampaigns();
            setCampaigns(result?.data || []);
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

    // ── Create / edit ──
    const openCreate = () => {
        setEditing(null);
        setForm(EMPTY_FORM);
        setFormError("");
        setFormOpen(true);
    };

    const openEdit = (campaign) => {
        setEditing(campaign);
        setForm({
            name: campaign.name || "",
            description: campaign.description || "",
            objective: campaign.objective || "BRAND_AWARENESS",
            budget: campaign.budget ?? "",
            startDate: toDateInput(campaign.startDate),
            endDate: toDateInput(campaign.endDate),
        });
        setFormError("");
        setOpenMenu(null);
        setViewing(null);
        setFormOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError("");

        if (!form.name.trim()) return setFormError("Please give your campaign a name.");
        if (!(Number(form.budget) > 0)) return setFormError("Please enter a budget greater than zero.");
        if (form.startDate && form.endDate && form.endDate < form.startDate) {
            return setFormError("The end date can't be before the start date.");
        }

        // Only campaign content — never `status` (status uses its own endpoint).
        const payload = {
            name: form.name.trim(),
            description: form.description.trim(),
            objective: form.objective,
            budget: Number(form.budget),
            startDate: form.startDate || null,
            endDate: form.endDate || null,
        };

        setSaving(true);
        try {
            if (editing) {
                await updateCampaign(editing._id, payload);
                setNotice({ type: "success", text: "Campaign updated." });
            } else {
                await createCampaign(payload);
                setNotice({ type: "success", text: "Campaign created as a draft. Submit it when it's ready." });
            }
            setFormOpen(false);
            setEditing(null);
            await load();
        } catch (err) {
            setFormError(friendly(err, editing ? "update this campaign" : "create campaigns"));
        } finally {
            setSaving(false);
        }
    };

    // ── View ──
    const openView = async (campaign) => {
        setOpenMenu(null);
        setViewing(campaign);
        setViewLoading(true);
        try {
            const result = await getCampaign(campaign._id);
            if (result?.data) setViewing(result.data);
        } catch (err) {
            setNotice({ type: "error", text: friendly(err, "load this campaign") });
        } finally {
            setViewLoading(false);
        }
    };

    // ── Status / delete (confirmed) ──
    const runConfirm = async () => {
        if (!confirm) return;
        const { campaign, kind, status } = confirm;
        setConfirming(true);
        try {
            if (kind === "delete") {
                await deleteCampaign(campaign._id);
                setNotice({ type: "success", text: "Campaign deleted." });
            } else {
                await updateCampaignStatus(campaign._id, status);
                setNotice({ type: "success", text: `Campaign is now ${campaignStatus(status).label.toLowerCase()}.` });
            }
            setConfirm(null);
            setViewing(null);
            await load();
        } catch (err) {
            setNotice({
                type: "error",
                text: friendly(err, kind === "delete" ? "delete this campaign" : "change this campaign"),
            });
            setConfirm(null);
        } finally {
            setConfirming(false);
        }
    };

    const actionsFor = (campaign) => nextCampaignStatuses("CUSTOMER", campaign.status);

    if (loading) return <PageLoading label="Loading your campaigns…" />;

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                        <Megaphone className="h-6 w-6 text-emerald-500" />
                        Campaigns
                    </h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">Create campaigns, submit them, and request bookings.</p>
                </div>
                {!loadError && (
                    <button
                        type="button"
                        onClick={openCreate}
                        className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-emerald-500/20 transition-colors hover:bg-emerald-600"
                    >
                        <Plus className="h-4 w-4" />
                        Create campaign
                    </button>
                )}
            </motion.div>

            {notice && (
                <div
                    className={`mb-4 flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${
                        notice.type === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                    }`}
                >
                    <span>{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {loadError ? (
                <ApiErrorState error={loadError} what="your campaigns" onRetry={load} />
            ) : campaigns.length === 0 ? (
                <EmptyState
                    icon={Megaphone}
                    title="You don't have any campaigns yet"
                    message="Create your first campaign to get started."
                    action={
                        <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                            <Plus className="h-4 w-4" />
                            Create campaign
                        </button>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {campaigns.map((campaign) => {
                        const badge = campaignStatus(campaign.status);
                        const actions = actionsFor(campaign);
                        const deletable = canDeleteCampaign(campaign.status);
                        // Running campaigns (bookings sent) are cancelled through the
                        // cancellation policy; earlier ones through the status menu.
                        const policyCancel = !actions.includes("CANCELLED") && !["CANCELLED", "COMPLETED", "REJECTED", "EXPIRED", "REFUNDED", "FAILED"].includes(campaign.status);
                        const hasMenu = actions.length > 0 || deletable || policyCancel;

                        return (
                            <motion.div
                                key={campaign._id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="relative flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-white">{campaign.name}</h3>
                                        <p className="mt-1 line-clamp-2 min-h-[40px] text-sm text-slate-500 dark:text-slate-400">
                                            {campaign.description || "No description yet"}
                                        </p>
                                    </div>

                                    {hasMenu && (
                                        <div className="relative shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => setOpenMenu(openMenu === campaign._id ? null : campaign._id)}
                                                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                                                aria-label="Campaign actions"
                                                aria-expanded={openMenu === campaign._id}
                                            >
                                                <MoreVertical className="h-5 w-5" />
                                            </button>
                                            <AnimatePresence>
                                                {openMenu === campaign._id && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                                        className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                                                    >
                                                        {actions.map((next) => (
                                                            <button
                                                                key={next}
                                                                type="button"
                                                                onClick={() => {
                                                                    setOpenMenu(null);
                                                                    setConfirm({ campaign, kind: "status", status: next });
                                                                }}
                                                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                                            >
                                                                {campaignActionLabel(campaign.status, next)}
                                                            </button>
                                                        ))}
                                                        {policyCancel && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setOpenMenu(null);
                                                                    setCancelCampaignTarget(campaign);
                                                                }}
                                                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                                                            >
                                                                Cancel campaign
                                                            </button>
                                                        )}
                                                        {deletable && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setOpenMenu(null);
                                                                    setConfirm({ campaign, kind: "delete" });
                                                                }}
                                                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                                                            >
                                                                Delete
                                                            </button>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </div>

                                <span className={`mt-4 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>

                                <div className="mt-5 grid grid-cols-2 gap-3">
                                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                                        <p className="text-xs text-slate-400 dark:text-slate-500">Budget</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{formatMoney(campaign.budget, campaign.currency)}</p>
                                    </div>
                                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                                        <p className="text-xs text-slate-400 dark:text-slate-500">Runs</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                                            {campaign.startDate ? `${formatDate(campaign.startDate)}` : "Dates not set"}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-auto flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => openView(campaign)}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                    >
                                        <Eye className="h-4 w-4" />
                                        View
                                    </button>
                                    {canEditCampaign(campaign.status) && (
                                        <button
                                            type="button"
                                            onClick={() => openEdit(campaign)}
                                            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
                                        >
                                            <Edit className="h-4 w-4" />
                                            Edit
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* CREATE / EDIT */}
            <Modal open={formOpen} onClose={() => setFormOpen(false)} busy={saving}>
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? "Edit campaign" : "Create campaign"}</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {editing ? "Update your campaign details." : "New campaigns start as a draft."}
                        </p>
                    </div>
                    <button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>

                {formError && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Campaign name</span>
                        <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Christmas radio campaign" maxLength={100} required className={inputClass} />
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">What is it for?</span>
                        <select value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} className={inputClass}>
                            {OBJECTIVES.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                            {!OBJECTIVES.some((o) => o.value === form.objective) && <option value={form.objective}>{objectiveLabel(form.objective)}</option>}
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</span>
                        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Tell stations what the campaign is about" className={`${inputClass} resize-none`} />
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Budget (₦)</span>
                        <input type="number" min="1" step="1" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="e.g. 500000" required className={inputClass} />
                    </label>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Start date (optional)</span>
                            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={inputClass} />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">End date (optional)</span>
                            <input type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputClass} />
                        </label>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-70">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {editing ? "Save changes" : "Create campaign"}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* VIEW */}
            <Modal open={!!viewing} onClose={() => setViewing(null)} busy={false} wide>
                {viewing && (
                    <>
                        <div className="flex items-start justify-between border-b border-slate-200 p-6 dark:border-slate-800">
                            <div className="min-w-0 pr-4">
                                <h2 className="truncate text-xl font-semibold text-slate-900 dark:text-white">{viewing.name}</h2>
                                <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${campaignStatus(viewing.status).className}`}>
                                    {campaignStatus(viewing.status).label}
                                </span>
                            </div>
                            <button type="button" onClick={() => setViewing(null)} className="shrink-0 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="space-y-6 p-6">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {[
                                    ["Purpose", objectiveLabel(viewing.objective)],
                                    ["Budget", formatMoney(viewing.budget, viewing.currency)],
                                    ["Start", formatDate(viewing.startDate)],
                                    ["End", formatDate(viewing.endDate)],
                                ].map(([label, value]) => (
                                    <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                                        <p className="text-xs text-slate-400">{label}</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
                                    </div>
                                ))}
                            </div>

                            <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {viewing.description || "No description yet."}
                            </p>

                            {viewLoading ? (
                                <div className="flex justify-center py-6">
                                    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                                </div>
                            ) : (
                                <>
                                    <section>
                                        <div className="mb-3 flex items-center justify-between">
                                            <h3 className="text-xs uppercase tracking-wider text-slate-400">Bookings ({viewing.bookings?.length || 0})</h3>
                                            <button
                                                type="button"
                                                onClick={() => setBookingFor(viewing._id)}
                                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                                            >
                                                <CalendarPlus className="h-4 w-4" /> Add spots to cart
                                            </button>
                                        </div>
                                        {viewing.bookings?.length ? (
                                            <div className="space-y-2">
                                                {viewing.bookings.map((booking) => {
                                                    const badge = bookingStatus(booking.status);
                                                    return (
                                                        <div key={booking._id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{booking.stationId?.name || "Station"}</p>
                                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                                    {formatDate(booking.date)}
                                                                    {booking.time ? ` · ${booking.time}` : ""} · {formatMoney(booking.price, booking.currency)}
                                                                </p>
                                                            </div>
                                                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">No bookings for this campaign yet.</p>
                                        )}
                                    </section>

                                    <section>
                                        <h3 className="mb-3 text-xs uppercase tracking-wider text-slate-400">Creatives</h3>
                                        <CampaignCreatives campaignId={viewing._id} />
                                    </section>
                                </>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-3 border-t border-slate-200 p-6 dark:border-slate-800">
                            {canEditCampaign(viewing.status) && (
                                <button type="button" onClick={() => openEdit(viewing)} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                                    <Edit className="h-4 w-4" /> Edit
                                </button>
                            )}
                            {actionsFor(viewing).map((next) => (
                                <button
                                    key={next}
                                    type="button"
                                    onClick={() => setConfirm({ campaign: viewing, kind: "status", status: next })}
                                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    {campaignActionLabel(viewing.status, next)}
                                </button>
                            ))}
                            <button type="button" onClick={() => setViewing(null)} className="ml-auto rounded-lg bg-slate-100 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                Close
                            </button>
                        </div>
                    </>
                )}
            </Modal>

            {/* CONFIRM */}
            <Modal open={!!confirm} onClose={() => setConfirm(null)} busy={confirming}>
                {confirm && (
                    <>
                        <div className="mb-4 flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${confirm.kind === "delete" ? "bg-red-100 dark:bg-red-500/10" : "bg-emerald-100 dark:bg-emerald-500/10"}`}>
                                {confirm.kind === "delete" ? <AlertTriangle className="h-5 w-5 text-red-500" /> : <Check className="h-5 w-5 text-emerald-500" />}
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                {confirm.kind === "delete" ? "Delete campaign?" : `${campaignActionLabel(confirm.campaign.status, confirm.status)}?`}
                            </h2>
                        </div>
                        <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">
                            {confirm.kind === "delete"
                                ? `"${confirm.campaign.name}" and its bookings and creatives will be deleted. This can't be undone.`
                                : confirm.status === "CANCELLED"
                                  ? `"${confirm.campaign.name}" will be cancelled. A cancelled campaign can't be reopened.`
                                  : `"${confirm.campaign.name}" will be submitted for review. You won't be able to edit it unless changes are requested.`}
                        </p>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setConfirm(null)} disabled={confirming} className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                Go back
                            </button>
                            <button
                                type="button"
                                onClick={runConfirm}
                                disabled={confirming}
                                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-70 ${
                                    confirm.kind === "delete" || confirm.status === "CANCELLED" ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"
                                }`}
                            >
                                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm.kind === "delete" ? <Trash2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                                {confirm.kind === "delete" ? "Delete" : campaignActionLabel(confirm.campaign.status, confirm.status)}
                            </button>
                        </div>
                    </>
                )}
            </Modal>

            <CancellationDialog
                open={!!cancelCampaignTarget}
                title={cancelCampaignTarget ? `Cancel "${cancelCampaignTarget.name}"?` : ""}
                currency={cancelCampaignTarget?.currency}
                loadQuote={loadCampaignQuote}
                onConfirm={async () => {
                    const result = await cancelCampaign(cancelCampaignTarget._id);
                    const refund = result?.data?.refundAmount || 0;
                    setCampaigns((prev) => prev.map((c) => (c._id === cancelCampaignTarget._id ? { ...c, status: "CANCELLED" } : c)));
                    setNotice({ type: result?.success === false ? "error" : "success", text: `${result?.message || "Campaign cancelled"}.${refund > 0 ? ` ${formatMoney(refund, cancelCampaignTarget.currency)} will be refunded.` : ""}` });
                    setCancelCampaignTarget(null);
                }}
                onClose={() => setCancelCampaignTarget(null)}
            />

            <BookingRequestModal
                open={!!bookingFor}
                campaignId={bookingFor}
                onClose={() => setBookingFor(null)}
                onCreated={async () => {
                    if (viewing) await openView(viewing);
                }}
            />
        </div>
    );
}
