'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    Clock3,
    DollarSign,
    Edit3,
    FileText,
    Loader2,
    Megaphone,
    Target,
    Trash2,
    User,
    XCircle,
} from 'lucide-react';
import { nextCampaignStatuses, campaignActionLabel, campaignStatus } from "@/lib/status";

import {
    getAdminIndividual,
    getAdminIndividualCampaign,
    deleteAdminIndividualCampaign,
    updateAdminIndividualCampaignStatus,
} from '@/lib/api';

export default function ViewIndividualCampaignPage() {
    const params = useParams();
    const router = useRouter();

    const individualId = params?.id;
    const campaignId = params?.campaignId;

    const [individual, setIndividual] = useState(null);
    const [campaign, setCampaign] = useState(null);

    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState('');
    const [error, setError] = useState('');

    const loadData = async () => {
        try {
            setLoading(true);
            setError('');

            const [individualResponse, campaignResponse] =
                await Promise.all([
                    getAdminIndividual(individualId),
                    getAdminIndividualCampaign(
                        individualId,
                        campaignId
                    ),
                ]);

            setIndividual(
                individualResponse?.data || individualResponse
            );

            setCampaign(
                campaignResponse?.campaign ||
                    campaignResponse?.data?.campaign ||
                    campaignResponse?.data ||
                    campaignResponse
            );
        } catch (err) {
            console.error('Failed to load campaign:', err);
            setError(
                err.message || 'Failed to load campaign information.'
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!individualId || !campaignId) return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, [individualId, campaignId]);

    const formatMoney = (amount, currency = 'NGN') => {
        if (amount === undefined || amount === null || amount === '') {
            return '—';
        }

        try {
            return new Intl.NumberFormat('en-NG', {
                style: 'currency',
                currency,
                maximumFractionDigits: 0,
            }).format(Number(amount));
        } catch {
            return `${currency} ${Number(amount).toLocaleString()}`;
        }
    };

    const formatDate = (date) => {
        if (!date) return '—';

        const parsed = new Date(date);

        if (Number.isNaN(parsed.getTime())) {
            return '—';
        }

        return parsed.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    };

    const formatStatus = (status) => {
        if (!status) return 'Unknown';

        return String(status)
            .replaceAll('_', ' ')
            .toLowerCase()
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
    };

    const getStatusStyle = (status) => {
        switch (String(status).toUpperCase()) {
            case 'DRAFT':
                return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

            case 'SUBMITTED':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400';

            case 'ACCEPTED':
            case 'CREATIVE_APPROVED':
            case 'SCHEDULED':
            case 'LIVE':
            case 'COMPLETED':
                return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400';

            case 'REJECTED':
            case 'CANCELLED':
            case 'FAILED':
                return 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400';

            case 'REVISION_REQUESTED':
                return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400';

            default:
                return 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400';
        }
    };

    const handleStatusChange = async (status) => {
        if (!campaign?._id) return;

        const confirmed = window.confirm(
            `Change campaign status to "${formatStatus(status)}"?`
        );

        if (!confirmed) return;

        try {
            setActionLoading(status);
            setError('');

            await updateAdminIndividualCampaignStatus(
                individualId,
                campaign._id,
                status
            );

            await loadData();
        } catch (err) {
            console.error('Failed to update campaign status:', err);

            setError(
                err.message ||
                    'Failed to update campaign status.'
            );
        } finally {
            setActionLoading('');
        }
    };

    const handleDelete = async () => {
        if (!campaign?._id) return;

        const confirmed = window.confirm(
            `Delete "${campaign.name}"?\n\nThis action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            setActionLoading('delete');
            setError('');

            await deleteAdminIndividualCampaign(
                individualId,
                campaign._id
            );

            router.push(
                `/admin/users/individuals/${individualId}/campaigns`
            );
        } catch (err) {
            console.error('Failed to delete campaign:', err);

            setError(
                err.message ||
                    'Failed to delete campaign.'
            );

            setActionLoading('');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-emerald-50/40 px-4 py-8 dark:bg-slate-950">
                <div className="mx-auto flex max-w-6xl items-center justify-center py-32">
                    <div className="flex items-center gap-3 text-emerald-600">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span className="font-medium">
                            Loading campaign...
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    if (error && !campaign) {
        return (
            <div className="min-h-screen bg-emerald-50/40 px-4 py-8 dark:bg-slate-950">
                <div className="mx-auto max-w-6xl">
                    <button
                        type="button"
                        onClick={() =>
                            router.push(
                                `/admin/users/individuals/${individualId}/campaigns`
                            )
                        }
                        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Campaigns
                    </button>

                    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-emerald-50/40 px-4 py-8 dark:bg-slate-950">
            <div className="mx-auto max-w-6xl">

                {/* Back */}
                <button
                    type="button"
                    onClick={() =>
                        router.push(
                            `/admin/users/individuals/${individualId}/campaigns`
                        )
                    }
                    className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Campaigns
                </button>

                {/* Header */}
                <div className="mb-6 overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-6 py-7 text-white sm:px-8">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">

                            <div className="flex gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                                    <Megaphone className="h-7 w-7" />
                                </div>

                                <div>
                                    <p className="mb-1 text-sm font-medium text-emerald-100">
                                        Campaign
                                    </p>

                                    <h1 className="text-2xl font-bold sm:text-3xl">
                                        {campaign?.name ||
                                            'Untitled Campaign'}
                                    </h1>

                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <span
                                            className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusStyle(
                                                campaign?.status
                                            )}`}
                                        >
                                            {formatStatus(
                                                campaign?.status
                                            )}
                                        </span>

                                        {campaign?.createdAt && (
                                            <span className="text-sm text-emerald-100">
                                                Created{' '}
                                                {formatDate(
                                                    campaign.createdAt
                                                )}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        `/admin/users/individuals/${individualId}/campaigns/${campaignId}/edit`
                                    )
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
                            >
                                <Edit3 className="h-4 w-4" />
                                Edit Campaign
                            </button>
                        </div>
                    </div>

                    {/* Individual */}
                    {individual && (
                        <div className="flex flex-col gap-3 border-t border-emerald-100 bg-emerald-50/50 px-6 py-4 dark:border-slate-800 dark:bg-emerald-950/20 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                                    <User className="h-5 w-5" />
                                </div>

                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                        Campaign Owner
                                    </p>

                                    <p className="font-semibold text-slate-900 dark:text-white">
                                        {individual.name ||
                                            individual.fullName ||
                                            'Individual'}
                                    </p>
                                </div>
                            </div>

                            {individual.email && (
                                <span className="text-sm text-slate-600 dark:text-slate-400">
                                    {individual.email}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                        {error}
                    </div>
                )}

                {/* Overview cards */}
                <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            <DollarSign className="h-5 w-5" />
                        </div>

                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Budget
                        </p>

                        <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                            {formatMoney(
                                campaign?.budget,
                                campaign?.currency || 'NGN'
                            )}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                            <CalendarDays className="h-5 w-5" />
                        </div>

                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Start Date
                        </p>

                        <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                            {formatDate(campaign?.startDate)}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
                            <Clock3 className="h-5 w-5" />
                        </div>

                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            End Date
                        </p>

                        <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                            {formatDate(campaign?.endDate)}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                            <Target className="h-5 w-5" />
                        </div>

                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Progress
                        </p>

                        <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                            {campaign?.progress ?? 0}%
                        </p>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">

                    {/* Main information */}
                    <div className="space-y-6 lg:col-span-2">

                        {/* Campaign information */}
                        <section className="rounded-3xl border border-emerald-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="border-b border-emerald-100 bg-emerald-50/50 px-6 py-5 dark:border-slate-800 dark:bg-emerald-950/20">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                                        <FileText className="h-5 w-5" />
                                    </div>

                                    <div>
                                        <h2 className="font-bold text-slate-900 dark:text-white">
                                            Campaign Information
                                        </h2>

                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            Details about this campaign.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6 p-6">

                                <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                        Objective
                                    </p>

                                    <div className="rounded-2xl bg-emerald-50/60 p-4 text-sm leading-6 text-slate-700 dark:bg-emerald-950/20 dark:text-slate-300">
                                        {campaign?.objective || 'No objective provided.'}
                                    </div>
                                </div>

                                <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                        Description
                                    </p>

                                    <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                                        {campaign?.description ||
                                            'No description provided.'}
                                    </div>
                                </div>

                                <div className="grid gap-5 sm:grid-cols-2">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                            Campaign ID
                                        </p>

                                        <p className="mt-1 break-all font-mono text-sm text-slate-800 dark:text-slate-300">
                                            {campaign?._id || '—'}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                            Currency
                                        </p>

                                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                                            {campaign?.currency || 'NGN'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Dates */}
                        <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <div className="mb-5 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                                    <CalendarDays className="h-5 w-5" />
                                </div>

                                <div>
                                    <h2 className="font-bold text-slate-900 dark:text-white">
                                        Campaign Period
                                    </h2>

                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        Scheduled campaign duration.
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 dark:border-slate-700 dark:bg-slate-800">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        Start
                                    </p>

                                    <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                                        {formatDate(
                                            campaign?.startDate
                                        )}
                                    </p>
                                </div>

                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 dark:border-slate-700 dark:bg-slate-800">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        End
                                    </p>

                                    <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                                        {formatDate(
                                            campaign?.endDate
                                        )}
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Right side */}
                    <div className="space-y-6">

                        {/* Status management */}
                        <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="font-bold text-slate-900 dark:text-white">
                                Campaign Status
                            </h2>

                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Only the steps allowed from the current status are shown.
                            </p>

                            <div className="mt-5 space-y-2">
                                {nextCampaignStatuses("ADMIN", campaign?.status).length === 0 ? (
                                    <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                        No status changes are available for a campaign that is {campaignStatus(campaign?.status).label.toLowerCase()}.
                                    </p>
                                ) : (
                                    nextCampaignStatuses("ADMIN", campaign?.status).map((next) => {
                                        const danger = next === "REJECTED" || next === "CANCELLED";
                                        return (
                                            <button
                                                key={next}
                                                type="button"
                                                disabled={!!actionLoading}
                                                onClick={() => handleStatusChange(next)}
                                                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                                    danger
                                                        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
                                                        : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400"
                                                }`}
                                            >
                                                <span>{next === "CANCELLED" ? "Cancel campaign" : campaignActionLabel(campaign?.status, next)}</span>
                                                {actionLoading === next ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : danger ? (
                                                    <XCircle className="h-4 w-4" />
                                                ) : next === "REVISION_REQUESTED" ? (
                                                    <Clock3 className="h-4 w-4" />
                                                ) : (
                                                    <CheckCircle2 className="h-4 w-4" />
                                                )}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </section>

                        {/* Management */}
                        <section className="rounded-3xl border border-red-100 bg-white p-6 shadow-sm dark:border-red-900/30 dark:bg-slate-900">
                            <h2 className="font-bold text-slate-900 dark:text-white">
                                Campaign Management
                            </h2>

                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                Administrative actions for this campaign.
                            </p>

                            <div className="mt-5 space-y-3">
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.push(
                                            `/admin/users/individuals/${individualId}/campaigns/${campaignId}/edit`
                                        )
                                    }
                                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400"
                                >
                                    <Edit3 className="h-4 w-4" />
                                    Edit Campaign
                                </button>

                                <button
                                    type="button"
                                    disabled={actionLoading === 'delete'}
                                    onClick={handleDelete}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
                                >
                                    {actionLoading === 'delete' ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-4 w-4" />
                                    )}

                                    Delete Campaign
                                </button>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}