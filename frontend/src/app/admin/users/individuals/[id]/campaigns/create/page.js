'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    FileText,
    Megaphone,
    Target,
    Wallet,
    Loader2,
    User,
} from 'lucide-react';

import {
    getAdminIndividual,
    createAdminIndividualCampaign,
} from '@/lib/api';

export default function CreateIndividualCampaignPage() {
    const params = useParams();
    const router = useRouter();

    const individualId = params?.id;

    const [individual, setIndividual] = useState(null);
    const [loadingIndividual, setLoadingIndividual] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [form, setForm] = useState({
        name: '',
        description: '',
        objective: '',
        budget: '',
        currency: 'NGN',
        startDate: '',
        endDate: '',
    });

    useEffect(() => {
        if (!individualId) return;

        const loadIndividual = async () => {
            try {
                setLoadingIndividual(true);
                setError('');

                const response = await getAdminIndividual(individualId);

                setIndividual(response?.data || response);
            } catch (err) {
                console.error('Failed to load individual:', err);
                setError(
                    err.message || 'Failed to load individual information.'
                );
            } finally {
                setLoadingIndividual(false);
            }
        };

        loadIndividual();
    }, [individualId]);

    const handleChange = (e) => {
        const { name, value } = e.target;

        setForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError('');
        setSuccess('');

        if (!form.name.trim()) {
            setError('Campaign name is required.');
            return;
        }

        if (!form.objective.trim()) {
            setError('Campaign objective is required.');
            return;
        }

        if (!form.budget) {
            setError('Campaign budget is required.');
            return;
        }

        if (!form.startDate || !form.endDate) {
            setError('Please select both campaign start and end dates.');
            return;
        }

        if (new Date(form.endDate) < new Date(form.startDate)) {
            setError('End date cannot be before the start date.');
            return;
        }

        try {
            setSubmitting(true);

            const payload = {
                name: form.name.trim(),
                description: form.description.trim(),
                objective: form.objective.trim(),
                budget: Number(form.budget),
                currency: form.currency,
                startDate: form.startDate,
                endDate: form.endDate,
            };

            const response = await createAdminIndividualCampaign(
                individualId,
                payload
            );

            const campaign =
                response?.campaign ||
                response?.data?.campaign ||
                response?.data;

            setSuccess('Campaign created successfully.');

            setTimeout(() => {
                if (campaign?._id) {
                    router.push(
                        `/admin/users/individuals/${individualId}/campaigns/${campaign._id}`
                    );
                } else {
                    router.push(
                        `/admin/users/individuals/${individualId}/campaigns`
                    );
                }
            }, 700);
        } catch (err) {
            console.error('Failed to create campaign:', err);
            setError(
                err.message ||
                'Failed to create campaign. Please try again.'
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingIndividual) {
        return (
            <div className="min-h-screen bg-emerald-50/40 px-4 py-8 dark:bg-slate-950">
                <div className="mx-auto flex max-w-5xl items-center justify-center py-32">
                    <div className="flex items-center gap-3 text-emerald-600">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span className="font-medium">
                            Loading individual...
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-emerald-50/40 px-4 py-8 dark:bg-slate-950">
            <div className="mx-auto max-w-5xl">

                {/* Back */}
                <button
                    type="button"
                    onClick={() =>
                        router.push(
                            `/admin/users/individuals/${individualId}`
                        )
                    }
                    className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 transition hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Individual
                </button>

                {/* Header */}
                <div className="mb-8">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                        <Megaphone className="h-6 w-6" />
                    </div>

                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                        Create Campaign
                    </h1>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                        Create a campaign on behalf of this individual and
                        manage it from their account.
                    </p>
                </div>

                {/* Individual banner */}
                {individual && (
                    <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-100/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                                <User className="h-5 w-5" />
                            </div>

                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                    Creating for
                                </p>

                                <p className="font-semibold text-slate-900 dark:text-white">
                                    {individual.name ||
                                        individual.fullName ||
                                        'Individual'}
                                </p>

                                {individual.email && (
                                    <p className="text-sm text-slate-600 dark:text-slate-400">
                                        {individual.email}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                        {error}
                    </div>
                )}

                {/* Success */}
                {success && (
                    <div className="mb-6 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
                        <CheckCircle2 className="h-5 w-5" />
                        {success}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">

                        {/* Form heading */}
                        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-6 py-5 dark:border-slate-800 dark:from-emerald-950/30 dark:to-slate-900 sm:px-8">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                                    <FileText className="h-5 w-5" />
                                </div>

                                <div>
                                    <h2 className="font-semibold text-slate-900 dark:text-white">
                                        Campaign Information
                                    </h2>

                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        Enter the basic details for this
                                        campaign.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8 p-6 sm:p-8">

                            {/* Campaign name */}
                            <div>
                                <label
                                    htmlFor="name"
                                    className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-200"
                                >
                                    Campaign Name
                                </label>

                                <input
                                    id="name"
                                    name="name"
                                    type="text"
                                    value={form.name}
                                    onChange={handleChange}
                                    placeholder="e.g. Christmas Brand Campaign"
                                    className="w-full rounded-xl border border-emerald-100 bg-emerald-50/30 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:bg-slate-800"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label
                                    htmlFor="description"
                                    className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-200"
                                >
                                    Description
                                </label>

                                <textarea
                                    id="description"
                                    name="description"
                                    rows={4}
                                    value={form.description}
                                    onChange={handleChange}
                                    placeholder="Describe what this campaign is about..."
                                    className="w-full resize-none rounded-xl border border-emerald-100 bg-emerald-50/30 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:bg-slate-800"
                                />
                            </div>

                            {/* Objective */}
                            <div>
                                <label
                                    htmlFor="objective"
                                    className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200"
                                >
                                    <Target className="h-4 w-4 text-emerald-600" />
                                    Campaign Objective
                                </label>

                                <textarea
                                    id="objective"
                                    name="objective"
                                    rows={3}
                                    value={form.objective}
                                    onChange={handleChange}
                                    placeholder="e.g. To promote awoof and increase brand awareness"
                                    className="w-full resize-none rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-500 dark:focus:bg-slate-800"
                                />
                            </div>

                            {/* Budget */}
                            <div>
                                <label
                                    htmlFor="budget"
                                    className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200"
                                >
                                    <Wallet className="h-4 w-4 text-emerald-600" />
                                    Campaign Budget
                                </label>

                                <div className="flex">
                                    <select
                                        name="currency"
                                        value={form.currency}
                                        onChange={handleChange}
                                        className="rounded-l-xl border border-emerald-200 border-r-0 bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-800 outline-none dark:border-slate-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                    >
                                        <option value="NGN">NGN</option>
                                        <option value="USD">USD</option>
                                    </select>

                                    <input
                                        id="budget"
                                        name="budget"
                                        type="number"
                                        min="0"
                                        value={form.budget}
                                        onChange={handleChange}
                                        placeholder="750000"
                                        className="min-w-0 flex-1 rounded-r-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-500 dark:focus:bg-slate-800"
                                    />
                                </div>
                            </div>

                            {/* Dates */}
                            <div>
                                <div className="mb-3 flex items-center gap-2">
                                    <CalendarDays className="h-4 w-4 text-emerald-600" />

                                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                        Campaign Period
                                    </h3>
                                </div>

                                <div className="grid gap-5 sm:grid-cols-2">
                                    <div>
                                        <label
                                            htmlFor="startDate"
                                            className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400"
                                        >
                                            Start Date
                                        </label>

                                        <input
                                            id="startDate"
                                            name="startDate"
                                            type="date"
                                            value={form.startDate}
                                            onChange={handleChange}
                                            className="w-full rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:bg-slate-800"
                                        />
                                    </div>

                                    <div>
                                        <label
                                            htmlFor="endDate"
                                            className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400"
                                        >
                                            End Date
                                        </label>

                                        <input
                                            id="endDate"
                                            name="endDate"
                                            type="date"
                                            value={form.endDate}
                                            onChange={handleChange}
                                            className="w-full rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:bg-slate-800"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex flex-col-reverse gap-3 border-t border-emerald-100 bg-emerald-50/40 px-6 py-5 dark:border-slate-800 dark:bg-slate-950/30 sm:flex-row sm:justify-end sm:px-8">
                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        `/admin/users/individuals/${individualId}`
                                    )
                                }
                                disabled={submitting}
                                className="rounded-xl border border-emerald-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Megaphone className="h-4 w-4" />
                                        Create Campaign
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