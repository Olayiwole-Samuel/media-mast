"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft,
    Save,
    Loader2,
    AlertCircle,
    CheckCircle2,
    CalendarDays,
    DollarSign,
    FileText,
    Target,
    User,
} from "lucide-react";

import {
    getAdminIndividual,
    getAdminIndividualCampaign,
    updateAdminIndividualCampaign,
} from "@/lib/api";

// yyyy-mm-dd for a date input.
function formatDateForInput(date) {
    if (!date) return "";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return "";
    }

    return parsed.toISOString().split("T")[0];
}

export default function EditIndividualCampaignPage() {
    const params = useParams();
    const router = useRouter();

    const individualId = params?.id;
    const campaignId = params?.campaignId;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [individual, setIndividual] = useState(null);
    const [campaign, setCampaign] = useState(null);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [form, setForm] = useState({
        name: "",
        description: "",
        objective: "",
        budget: "",
        currency: "NGN",
        startDate: "",
        endDate: "",
    });

    async function loadCampaign() {
        try {
            setLoading(true);
            setError("");

            const [individualResponse, campaignResponse] =
                await Promise.all([
                    getAdminIndividual(individualId),
                    getAdminIndividualCampaign(
                        individualId,
                        campaignId
                    ),
                ]);

            const individualData =
                individualResponse?.data ||
                individualResponse?.individual ||
                individualResponse;

            const campaignData =
                campaignResponse?.campaign ||
                campaignResponse?.data?.campaign ||
                campaignResponse?.data ||
                campaignResponse;

            if (!campaignData?._id) {
                throw new Error(
                    "Campaign information could not be loaded."
                );
            }

            setIndividual(individualData);
            setCampaign(campaignData);

            setForm({
                name: campaignData.name || "",
                description:
                    campaignData.description || "",
                objective:
                    campaignData.objective || "",
                budget:
                    campaignData.budget !== undefined &&
                    campaignData.budget !== null
                        ? String(campaignData.budget)
                        : "",
                currency:
                    campaignData.currency || "NGN",
                startDate: formatDateForInput(
                    campaignData.startDate
                ),
                endDate: formatDateForInput(
                    campaignData.endDate
                ),
            });
        } catch (err) {
            console.error(
                "Failed to load campaign:",
                err
            );

            setError(
                err?.message ||
                    "Failed to load campaign."
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!individualId || !campaignId) return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadCampaign();
    }, [individualId, campaignId]);

    const formatCurrency = (value) => {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return "0";
        }

        return new Intl.NumberFormat("en-NG").format(
            number
        );
    };

    const handleChange = (event) => {
        const { name, value } = event.target;

        setForm((previous) => ({
            ...previous,
            [name]: value,
        }));

        if (error) {
            setError("");
        }

        if (success) {
            setSuccess("");
        }
    };

    const validateForm = () => {
        if (!form.name.trim()) {
            return "Campaign name is required.";
        }

        if (!form.objective.trim()) {
            return "Campaign objective is required.";
        }

        if (
            form.budget === "" ||
            form.budget === null ||
            form.budget === undefined
        ) {
            return "Campaign budget is required.";
        }

        const budget = Number(form.budget);

        if (!Number.isFinite(budget) || budget < 0) {
            return "Campaign budget must be a valid non-negative number.";
        }

        if (form.startDate && form.endDate) {
            const start = new Date(
                `${form.startDate}T00:00:00`
            );

            const end = new Date(
                `${form.endDate}T00:00:00`
            );

            if (
                Number.isNaN(start.getTime()) ||
                Number.isNaN(end.getTime())
            ) {
                return "Please enter valid campaign dates.";
            }

            if (start > end) {
                return "Start date cannot be after end date.";
            }
        }

        return "";
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        setError("");
        setSuccess("");

        const validationError = validateForm();

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);

            const payload = {
                name: form.name.trim(),
                description:
                    form.description.trim() || null,
                objective: form.objective.trim(),
                budget: Number(form.budget),
                currency:
                    form.currency.trim().toUpperCase() ||
                    "NGN",
                startDate:
                    form.startDate || null,
                endDate:
                    form.endDate || null,
            };

            await updateAdminIndividualCampaign(
                individualId,
                campaignId,
                payload
            );

            setSuccess(
                "Campaign updated successfully."
            );

            setTimeout(() => {
                router.push(
                    `/admin/users/individuals/${individualId}/campaigns/${campaignId}`
                );
            }, 900);
        } catch (err) {
            console.error(
                "Failed to update campaign:",
                err
            );

            setError(
                err?.message ||
                    "Failed to update campaign."
            );
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        router.push(
            `/admin/users/individuals/${individualId}/campaigns/${campaignId}`
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-400">
                    <Loader2
                        size={20}
                        className="animate-spin text-emerald-400"
                    />
                    Loading campaign...
                </div>
            </div>
        );
    }

    if (error && !campaign) {
        return (
            <div className="min-h-screen bg-slate-950 text-white px-4 py-8 md:px-8">
                <button
                    type="button"
                    onClick={() =>
                        router.back()
                    }
                    className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
                >
                    <ArrowLeft size={18} />
                    Back
                </button>

                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle
                            size={20}
                            className="mt-0.5 text-red-400"
                        />

                        <div>
                            <h2 className="font-semibold text-white">
                                Unable to load campaign
                            </h2>

                            <p className="mt-1 text-sm text-red-300">
                                {error}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">

                {/* HEADER */}
                <div className="mb-8">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="mb-5 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
                    >
                        <ArrowLeft size={18} />
                        Back to Campaign
                    </button>

                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="mb-3 flex items-center gap-2 text-sm text-emerald-400">
                                <FileText size={16} />
                                Campaign Management
                            </div>

                            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                                Edit Campaign
                            </h1>

                            <p className="mt-2 max-w-2xl text-sm text-slate-400">
                                Update the campaign information
                                for this individual.
                            </p>
                        </div>

                        {campaign?.status && (
                            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm">
                                <span className="text-slate-500">
                                    Current status
                                </span>

                                <span className="font-semibold text-emerald-400">
                                    {campaign.status}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ALERTS */}
                {error && (
                    <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle
                                size={19}
                                className="mt-0.5 shrink-0 text-red-400"
                            />

                            <p className="text-sm text-red-300">
                                {error}
                            </p>
                        </div>
                    </div>
                )}

                {success && (
                    <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2
                                size={19}
                                className="shrink-0 text-emerald-400"
                            />

                            <p className="text-sm text-emerald-300">
                                {success}
                            </p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

                        {/* MAIN FORM */}
                        <div className="space-y-6 lg:col-span-2">

                            {/* BASIC INFORMATION */}
                            <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
                                <div className="border-b border-slate-800 px-5 py-5 md:px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                                            <FileText
                                                size={18}
                                                className="text-emerald-400"
                                            />
                                        </div>

                                        <div>
                                            <h2 className="font-semibold text-white">
                                                Basic Information
                                            </h2>

                                            <p className="text-xs text-slate-500">
                                                Core campaign details
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5 p-5 md:p-6">

                                    {/* CAMPAIGN NAME */}
                                    <div>
                                        <label
                                            htmlFor="name"
                                            className="mb-2 block text-sm font-medium text-slate-300"
                                        >
                                            Campaign Name
                                        </label>

                                        <input
                                            id="name"
                                            name="name"
                                            type="text"
                                            value={form.name}
                                            onChange={handleChange}
                                            placeholder="Enter campaign name"
                                            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
                                        />
                                    </div>

                                    {/* OBJECTIVE */}
                                    <div>
                                        <label
                                            htmlFor="objective"
                                            className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-300"
                                        >
                                            <Target
                                                size={15}
                                                className="text-emerald-400"
                                            />
                                            Objective
                                        </label>

                                        <input
                                            id="objective"
                                            name="objective"
                                            type="text"
                                            value={form.objective}
                                            onChange={handleChange}
                                            placeholder="e.g. BRAND_AWARENESS"
                                            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
                                        />

                                        <p className="mt-2 text-xs text-slate-600">
                                            Enter the campaign objective used
                                            by your campaign workflow.
                                        </p>
                                    </div>

                                    {/* DESCRIPTION */}
                                    <div>
                                        <label
                                            htmlFor="description"
                                            className="mb-2 block text-sm font-medium text-slate-300"
                                        >
                                            Description
                                        </label>

                                        <textarea
                                            id="description"
                                            name="description"
                                            value={
                                                form.description
                                            }
                                            onChange={handleChange}
                                            rows={6}
                                            placeholder="Describe the campaign..."
                                            className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* BUDGET */}
                            <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
                                <div className="border-b border-slate-800 px-5 py-5 md:px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                                            <DollarSign
                                                size={18}
                                                className="text-emerald-400"
                                            />
                                        </div>

                                        <div>
                                            <h2 className="font-semibold text-white">
                                                Budget
                                            </h2>

                                            <p className="text-xs text-slate-500">
                                                Campaign financial information
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-3 md:p-6">

                                    {/* BUDGET */}
                                    <div className="md:col-span-2">
                                        <label
                                            htmlFor="budget"
                                            className="mb-2 block text-sm font-medium text-slate-300"
                                        >
                                            Campaign Budget
                                        </label>

                                        <input
                                            id="budget"
                                            name="budget"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={form.budget}
                                            onChange={handleChange}
                                            placeholder="0"
                                            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
                                        />

                                        {form.budget !== "" && (
                                            <p className="mt-2 text-xs text-slate-600">
                                                Preview:{" "}
                                                {form.currency ||
                                                    "NGN"}{" "}
                                                {formatCurrency(
                                                    form.budget
                                                )}
                                            </p>
                                        )}
                                    </div>

                                    {/* CURRENCY */}
                                    <div>
                                        <label
                                            htmlFor="currency"
                                            className="mb-2 block text-sm font-medium text-slate-300"
                                        >
                                            Currency
                                        </label>

                                        <input
                                            id="currency"
                                            name="currency"
                                            type="text"
                                            maxLength={3}
                                            value={form.currency}
                                            onChange={handleChange}
                                            placeholder="NGN"
                                            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm uppercase text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
                                        />
                                    </div>
                                </div>
                            </section>

                            {/* CAMPAIGN PERIOD */}
                            <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
                                <div className="border-b border-slate-800 px-5 py-5 md:px-6">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                                            <CalendarDays
                                                size={18}
                                                className="text-emerald-400"
                                            />
                                        </div>

                                        <div>
                                            <h2 className="font-semibold text-white">
                                                Campaign Period
                                            </h2>

                                            <p className="text-xs text-slate-500">
                                                Set when the campaign runs
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2 md:p-6">

                                    {/* START DATE */}
                                    <div>
                                        <label
                                            htmlFor="startDate"
                                            className="mb-2 block text-sm font-medium text-slate-300"
                                        >
                                            Start Date
                                        </label>

                                        <input
                                            id="startDate"
                                            name="startDate"
                                            type="date"
                                            value={
                                                form.startDate
                                            }
                                            onChange={handleChange}
                                            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
                                        />
                                    </div>

                                    {/* END DATE */}
                                    <div>
                                        <label
                                            htmlFor="endDate"
                                            className="mb-2 block text-sm font-medium text-slate-300"
                                        >
                                            End Date
                                        </label>

                                        <input
                                            id="endDate"
                                            name="endDate"
                                            type="date"
                                            value={
                                                form.endDate
                                            }
                                            onChange={handleChange}
                                            min={
                                                form.startDate ||
                                                undefined
                                            }
                                            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
                                        />
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* SIDEBAR */}
                        <div className="space-y-6">

                            {/* OWNER */}
                            <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
                                <div className="border-b border-slate-800 px-5 py-5">
                                    <div className="flex items-center gap-3">
                                        <User
                                            size={18}
                                            className="text-emerald-400"
                                        />

                                        <h2 className="font-semibold text-white">
                                            Campaign Owner
                                        </h2>
                                    </div>
                                </div>

                                <div className="p-5">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-sm font-semibold text-emerald-400">
                                            {(
                                                individual?.name ||
                                                "U"
                                            )
                                                .charAt(0)
                                                .toUpperCase()}
                                        </div>

                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-white">
                                                {individual?.name ||
                                                    "Unknown"}
                                            </p>

                                            <p className="mt-1 truncate text-xs text-slate-500">
                                                {individual?.email ||
                                                    "No email"}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* CAMPAIGN INFO */}
                            <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
                                <div className="border-b border-slate-800 px-5 py-5">
                                    <h2 className="font-semibold text-white">
                                        Campaign Information
                                    </h2>
                                </div>

                                <div className="divide-y divide-slate-800">
                                    <div className="px-5 py-4">
                                        <p className="text-xs text-slate-600">
                                            Campaign ID
                                        </p>

                                        <p className="mt-1 break-all font-mono text-xs text-slate-400">
                                            {campaign?._id}
                                        </p>
                                    </div>

                                    <div className="px-5 py-4">
                                        <p className="text-xs text-slate-600">
                                            Current Status
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-emerald-400">
                                            {campaign?.status ||
                                                "DRAFT"}
                                        </p>
                                    </div>

                                    <div className="px-5 py-4">
                                        <p className="text-xs text-slate-600">
                                            Created
                                        </p>

                                        <p className="mt-1 text-sm text-slate-300">
                                            {campaign?.createdAt
                                                ? new Date(
                                                      campaign.createdAt
                                                  ).toLocaleDateString(
                                                      "en-NG",
                                                      {
                                                          day: "numeric",
                                                          month: "short",
                                                          year: "numeric",
                                                      }
                                                  )
                                                : "—"}
                                        </p>
                                    </div>
                                </div>
                            </section>

                            {/* STATUS NOTICE */}
                            <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                                <div className="flex items-start gap-3">
                                    <AlertCircle
                                        size={18}
                                        className="mt-0.5 shrink-0 text-amber-400"
                                    />

                                    <div>
                                        <h3 className="text-sm font-semibold text-amber-300">
                                            Campaign status
                                        </h3>

                                        <p className="mt-1 text-xs leading-5 text-slate-500">
                                            Status is managed separately
                                            from campaign details. Use the
                                            campaign management controls
                                            on the campaign view page to
                                            change the status.
                                        </p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>

                    {/* ACTION BAR */}
                    <div className="sticky bottom-0 z-20 mt-8 border-t border-slate-800 bg-slate-950/95 py-4 backdrop-blur">
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={saving}
                                className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? (
                                    <>
                                        <Loader2
                                            size={17}
                                            className="animate-spin"
                                        />
                                        Saving Changes...
                                    </>
                                ) : (
                                    <>
                                        <Save size={17} />
                                        Save Changes
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}