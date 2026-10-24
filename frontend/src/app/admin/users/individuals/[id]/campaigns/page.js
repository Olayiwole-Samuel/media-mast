'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    CalendarDays,
    ChevronRight,
    DollarSign,
    Loader2,
    Megaphone,
    Plus,
    Search,
    Target,
    User,
    X,
} from 'lucide-react';

import {
    getAdminIndividual,
    getAdminIndividualCampaigns,
} from '@/lib/api';

export default function IndividualCampaignsPage() {
    const params = useParams();
    const router = useRouter();

    const individualId = params?.id;

    const [individual, setIndividual] = useState(null);
    const [campaigns, setCampaigns] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    const loadData = async () => {
        try {
            setLoading(true);
            setError('');

            const [
                individualResponse,
                campaignsResponse,
            ] = await Promise.all([
                getAdminIndividual(individualId),
                getAdminIndividualCampaigns(individualId),
            ]);

            const individualData =
                individualResponse?.data ||
                individualResponse;

            const campaignData =
                campaignsResponse?.campaigns ||
                campaignsResponse?.data?.campaigns ||
                campaignsResponse?.data ||
                campaignsResponse;

            setIndividual(individualData);

            setCampaigns(
                Array.isArray(campaignData)
                    ? campaignData
                    : []
            );
        } catch (err) {
            console.error(
                'Failed to load individual campaigns:',
                err
            );

            setError(
                err.message ||
                    'Failed to load campaigns.'
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!individualId) return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, [individualId]);

    const formatMoney = (
        amount,
        currency = 'NGN'
    ) => {
        if (
            amount === undefined ||
            amount === null ||
            amount === ''
        ) {
            return '—';
        }

        try {
            return new Intl.NumberFormat('en-NG', {
                style: 'currency',
                currency,
                maximumFractionDigits: 0,
            }).format(Number(amount));
        } catch {
            return `${currency} ${Number(
                amount
            ).toLocaleString()}`;
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
            .replace(/\b\w/g, (letter) =>
                letter.toUpperCase()
            );
    };

    const getStatusStyle = (status) => {
        switch (
            String(status).toUpperCase()
        ) {
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

    const availableStatuses = useMemo(() => {
        const statuses = campaigns
            .map((campaign) => campaign?.status)
            .filter(Boolean);

        return [
            'ALL',
            ...Array.from(
                new Set(statuses)
            ),
        ];
    }, [campaigns]);

    const filteredCampaigns = useMemo(() => {
        const query =
            search.trim().toLowerCase();

        return campaigns.filter(
            (campaign) => {
                const matchesSearch =
                    !query ||
                    campaign?.name
                        ?.toLowerCase()
                        .includes(query) ||
                    campaign?.objective
                        ?.toLowerCase()
                        .includes(query) ||
                    campaign?.description
                        ?.toLowerCase()
                        .includes(query);

                const matchesStatus =
                    statusFilter === 'ALL' ||
                    String(
                        campaign?.status
                    ).toUpperCase() ===
                        String(
                            statusFilter
                        ).toUpperCase();

                return (
                    matchesSearch &&
                    matchesStatus
                );
            }
        );
    }, [
        campaigns,
        search,
        statusFilter,
    ]);

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('ALL');
    };

    const hasFilters =
        search.trim() ||
        statusFilter !== 'ALL';

    if (loading) {
        return (
            <div className="min-h-screen bg-emerald-50/40 px-4 py-8 dark:bg-slate-950">
                <div className="mx-auto flex max-w-6xl items-center justify-center py-32">
                    <div className="flex items-center gap-3 text-emerald-600">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span className="font-medium">
                            Loading campaigns...
                        </span>
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
                            `/admin/users/individuals/${individualId}`
                        )
                    }
                    className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Individual
                </button>

                {/* Header */}
                <div className="mb-6 overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-500 px-6 py-7 text-white sm:px-8">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

                            <div className="flex gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                                    <Megaphone className="h-7 w-7" />
                                </div>

                                <div>
                                    <p className="text-sm font-medium text-emerald-100">
                                        Individual Campaigns
                                    </p>

                                    <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
                                        {individual?.name ||
                                            individual?.fullName ||
                                            'Individual'}
                                    </h1>

                                    {individual?.email && (
                                        <div className="mt-2 flex items-center gap-2 text-sm text-emerald-100">
                                            <User className="h-4 w-4" />
                                            {individual.email}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        `/admin/users/individuals/${individualId}/campaigns/create`
                                    )
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
                            >
                                <Plus className="h-4 w-4" />
                                Create Campaign
                            </button>
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-2 divide-x divide-emerald-100 dark:divide-slate-800 sm:grid-cols-4">
                        <div className="p-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Total Campaigns
                            </p>

                            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                                {campaigns.length}
                            </p>
                        </div>

                        <div className="p-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Active
                            </p>

                            <p className="mt-1 text-2xl font-bold text-emerald-600">
                                {
                                    campaigns.filter(
                                        (campaign) =>
                                            [
                                                'ACCEPTED',
                                                'SCHEDULED',
                                                'LIVE',
                                            ].includes(
                                                String(
                                                    campaign?.status
                                                ).toUpperCase()
                                            )
                                    ).length
                                }
                            </p>
                        </div>

                        <div className="p-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Submitted
                            </p>

                            <p className="mt-1 text-2xl font-bold text-blue-600">
                                {
                                    campaigns.filter(
                                        (campaign) =>
                                            String(
                                                campaign?.status
                                            ).toUpperCase() ===
                                            'SUBMITTED'
                                    ).length
                                }
                            </p>
                        </div>

                        <div className="p-5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Completed
                            </p>

                            <p className="mt-1 text-2xl font-bold text-violet-600">
                                {
                                    campaigns.filter(
                                        (campaign) =>
                                            String(
                                                campaign?.status
                                            ).toUpperCase() ===
                                            'COMPLETED'
                                    ).length
                                }
                            </p>
                        </div>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                        {error}
                    </div>
                )}

                {/* Search / Filters */}
                <div className="mb-6 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-col gap-3 lg:flex-row">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />

                            <input
                                type="text"
                                value={search}
                                onChange={(event) =>
                                    setSearch(
                                        event.target.value
                                    )
                                }
                                placeholder="Search campaigns..."
                                className="w-full rounded-xl border border-emerald-200 bg-emerald-50/50 py-3 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-emerald-500 dark:focus:bg-slate-800"
                            />
                        </div>

                        <div className="flex gap-2">
                            <select
                                value={statusFilter}
                                onChange={(event) =>
                                    setStatusFilter(
                                        event.target.value
                                    )
                                }
                                className="min-w-44 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            >
                                {availableStatuses.map(
                                    (status) => (
                                        <option
                                            key={status}
                                            value={status}
                                        >
                                            {status ===
                                            'ALL'
                                                ? 'All Statuses'
                                                : formatStatus(
                                                      status
                                                  )}
                                        </option>
                                    )
                                )}
                            </select>

                            {hasFilters && (
                                <button
                                    type="button"
                                    onClick={
                                        clearFilters
                                    }
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                    <X className="h-4 w-4" />
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Showing{' '}
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            {filteredCampaigns.length}
                        </span>{' '}
                        of {campaigns.length}{' '}
                        campaigns
                    </div>
                </div>

                {/* Empty state */}
                {filteredCampaigns.length === 0 ? (
                    <div className="rounded-3xl border border-emerald-100 bg-white px-6 py-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            {hasFilters ? (
                                <Search className="h-7 w-7" />
                            ) : (
                                <Megaphone className="h-7 w-7" />
                            )}
                        </div>

                        <h2 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">
                            {hasFilters
                                ? 'No campaigns found'
                                : 'No campaigns yet'}
                        </h2>

                        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                            {hasFilters
                                ? 'Try changing your search or status filter.'
                                : 'This individual does not have any campaigns yet. Create the first campaign on their behalf.'}
                        </p>

                        {hasFilters ? (
                            <button
                                type="button"
                                onClick={
                                    clearFilters
                                }
                                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"
                            >
                                <X className="h-4 w-4" />
                                Clear Filters
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        `/admin/users/individuals/${individualId}/campaigns/create`
                                    )
                                }
                                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"
                            >
                                <Plus className="h-4 w-4" />
                                Create Campaign
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredCampaigns.map(
                            (campaign) => (
                                <button
                                    key={
                                        campaign?._id
                                    }
                                    type="button"
                                    onClick={() =>
                                        router.push(
                                            `/admin/users/individuals/${individualId}/campaigns/${campaign._id}`
                                        )
                                    }
                                    className="group w-full rounded-3xl border border-emerald-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800 sm:p-6"
                                >
                                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                                                    <Megaphone className="h-5 w-5" />
                                                </div>

                                                <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                                                    {campaign?.name ||
                                                        'Untitled Campaign'}
                                                </h2>

                                                <span
                                                    className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusStyle(
                                                        campaign?.status
                                                    )}`}
                                                >
                                                    {formatStatus(
                                                        campaign?.status
                                                    )}
                                                </span>
                                            </div>

                                            <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                                                {campaign?.objective ||
                                                    campaign?.description ||
                                                    'No campaign objective provided.'}
                                            </p>

                                            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <DollarSign className="h-4 w-4 text-emerald-600" />

                                                    <div>
                                                        <p className="text-xs text-slate-500 dark:text-slate-500">
                                                            Budget
                                                        </p>

                                                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                                                            {formatMoney(
                                                                campaign?.budget,
                                                                campaign?.currency ||
                                                                    'NGN'
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 text-sm">
                                                    <CalendarDays className="h-4 w-4 text-blue-600" />

                                                    <div>
                                                        <p className="text-xs text-slate-500 dark:text-slate-500">
                                                            Start
                                                        </p>

                                                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                                                            {formatDate(
                                                                campaign?.startDate
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 text-sm">
                                                    <CalendarDays className="h-4 w-4 text-violet-600" />

                                                    <div>
                                                        <p className="text-xs text-slate-500 dark:text-slate-500">
                                                            End
                                                        </p>

                                                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                                                            {formatDate(
                                                                campaign?.endDate
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 text-sm">
                                                    <Target className="h-4 w-4 text-amber-600" />

                                                    <div>
                                                        <p className="text-xs text-slate-500 dark:text-slate-500">
                                                            Progress
                                                        </p>

                                                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                                                            {campaign?.progress ??
                                                                0}
                                                            %
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 items-center justify-between border-t border-emerald-100 pt-4 lg:border-t-0 lg:pt-0">
                                            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                                View Campaign
                                            </span>

                                            <div className="ml-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-950/30 dark:text-emerald-400">
                                                <ChevronRight className="h-5 w-5" />
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            )
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}