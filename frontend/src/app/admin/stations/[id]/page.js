'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
    ArrowLeft,
    Building2,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Globe,
    Mail,
    MapPin,
    Monitor,
    Pencil,
    Phone,
    Radio,
    Tv,
    Newspaper,
    Megaphone,
    Wrench,
    XCircle,
    ExternalLink,
    Power,
    PowerOff,
    RefreshCw,
    Ruler,
    Users,
} from 'lucide-react';

import {
    getAdminStation,
    approveAdminStation,
    rejectAdminStation,
    activateAdminStation,
    deactivateAdminStation,
    updateAdminStationInventoryStatus,
} from '@/lib/api';


// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const TYPE_ICONS = {
    TV: Tv,
    RADIO: Radio,
    PRESS: Newspaper,
    BILLBOARD: Megaphone,
    DIGITAL: Monitor,
};

const TYPE_LABELS = {
    TV: 'Television',
    RADIO: 'Radio',
    PRESS: 'Press',
    BILLBOARD: 'Billboard',
    DIGITAL: 'Digital',
};

const APPROVAL_STYLES = {
    PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    APPROVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    REJECTED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const INVENTORY_STYLES = {
    AVAILABLE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    BOOKED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    UNAVAILABLE: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    MAINTENANCE: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const formatType = (type) => {
    return TYPE_LABELS[type] || type || 'Unknown';
};

const formatStatus = (status) => {
    if (!status) return 'Unknown';

    return status
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

const formatDate = (date) => {
    if (!date) return '—';

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return '—';
    }

    return parsed.toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
};

const formatDateTime = (date) => {
    if (!date) return '—';

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return '—';
    }

    return parsed.toLocaleString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const formatPrice = (pricing) => {
    if (
        !pricing ||
        pricing.amount === undefined ||
        pricing.amount === null
    ) {
        return '—';
    }

    const amount = Number(pricing.amount);

    if (Number.isNaN(amount)) {
        return '—';
    }

    return `${pricing.currency || 'NGN'} ${amount.toLocaleString('en-NG')}`;
};

const getCompanyName = (company) => {
    // No media company: the station is run by its station managers.
    if (!company) return 'None (run by station managers)';

    if (typeof company === 'string') {
        return company;
    }

    return company.name || '—';
};


// ─────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────

function StatusBadge({ children, styles }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                styles ||
                'bg-slate-800 text-slate-300 border-slate-700'
            }`}
        >
            {children}
        </span>
    );
}

function InfoRow({ label, value }) {
    return (
        <div className="flex flex-col gap-1 border-b border-slate-800/80 py-4 last:border-b-0">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {label}
            </span>

            <span className="text-sm text-slate-200">
                {value || '—'}
            </span>
        </div>
    );
}

function Section({ title, icon: Icon, children }) {
    return (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70">
            <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Icon size={18} />
                </div>

                <h2 className="text-sm font-semibold text-white">
                    {title}
                </h2>
            </div>

            <div className="px-5">
                {children}
            </div>
        </section>
    );
}

function EmptyState({ text = 'No information available.' }) {
    return (
        <div className="py-8 text-center text-sm text-slate-500">
            {text}
        </div>
    );
}


// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────

export default function AdminStationDetailsPage() {
    const params = useParams();
    const router = useRouter();

    const stationId = params?.id;

    const [station, setStation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState('');


    // ─────────────────────────────────────────
    // LOAD STATION
    // ─────────────────────────────────────────

    const loadStation = async (isRefresh = false) => {
        if (!stationId) return;

        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            setError('');

            const response = await getAdminStation(stationId);

            setStation(response?.data || null);
        } catch (err) {
            console.error('Failed to load station:', err);

            setError(
                err?.message ||
                'Failed to load station information.'
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };


    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadStation();
    }, [stationId]);


    // ─────────────────────────────────────────
    // ACTIONS
    // ─────────────────────────────────────────

    const handleAction = async (action) => {
        if (!station?._id) return;

        try {
            setActionLoading(action);
            setError('');

            let response;

            switch (action) {
                case 'approve':
                    response = await approveAdminStation(station._id);
                    break;

                case 'reject':
                    response = await rejectAdminStation(station._id);
                    break;

                case 'activate':
                    response = await activateAdminStation(station._id);
                    break;

                case 'deactivate':
                    response = await deactivateAdminStation(station._id);
                    break;

                case 'available':
                    response = await updateAdminStationInventoryStatus(
                        station._id,
                        'AVAILABLE'
                    );
                    break;

                case 'maintenance':
                    response = await updateAdminStationInventoryStatus(
                        station._id,
                        'MAINTENANCE'
                    );
                    break;

                case 'unavailable':
                    response = await updateAdminStationInventoryStatus(
                        station._id,
                        'UNAVAILABLE'
                    );
                    break;

                default:
                    return;
            }

            if (response?.data?._id) {
                setStation(response.data);
            } else {
                await loadStation(true);
            }
        } catch (err) {
            console.error(`Failed to ${action} station:`, err);

            setError(
                err?.message ||
                `Failed to ${action} station.`
            );
        } finally {
            setActionLoading('');
        }
    };


    // ─────────────────────────────────────────
    // LOADING STATE
    // ─────────────────────────────────────────

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-950 p-6">
                <div className="mx-auto max-w-7xl">
                    <div className="flex min-h-[60vh] items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <RefreshCw
                                size={28}
                                className="animate-spin text-emerald-400"
                            />

                            <p className="text-sm text-slate-500">
                                Loading station...
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        );
    }


    // ─────────────────────────────────────────
    // ERROR STATE (no station)
    // ─────────────────────────────────────────

    if (error && !station) {
        return (
            <main className="min-h-screen bg-slate-950 p-6">
                <div className="mx-auto max-w-7xl">
                    <button
                        type="button"
                        onClick={() => router.push('/admin/stations')}
                        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
                    >
                        <ArrowLeft size={17} />
                        Back to Stations
                    </button>

                    <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
                        <div className="flex items-start gap-3">
                            <XCircle
                                size={20}
                                className="mt-0.5 text-red-400"
                            />

                            <div>
                                <h2 className="font-semibold text-white">
                                    Unable to load station
                                </h2>

                                <p className="mt-1 text-sm text-red-300/80">
                                    {error}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => loadStation()}
                            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                        >
                            <RefreshCw size={16} />
                            Try Again
                        </button>
                    </div>
                </div>
            </main>
        );
    }


    // ─────────────────────────────────────────
    // NOT FOUND STATE
    // ─────────────────────────────────────────

    if (!station) {
        return (
            <main className="min-h-screen bg-slate-950 p-6">
                <div className="mx-auto max-w-7xl">
                    <button
                        type="button"
                        onClick={() => router.push('/admin/stations')}
                        className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
                    >
                        <ArrowLeft size={17} />
                        Back to Stations
                    </button>

                    <div className="flex min-h-[50vh] items-center justify-center">
                        <div className="text-center">
                            <h2 className="text-lg font-semibold text-white">
                                Station not found
                            </h2>

                            <p className="mt-2 text-sm text-slate-500">
                                The station may have been removed or no longer exists.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        );
    }


    // ─────────────────────────────────────────
    // DERIVED VALUES
    // ─────────────────────────────────────────

    const TypeIcon = TYPE_ICONS[station.type] || Monitor;

    const company = station.companyId;

    const location = station.location || {};
    const coordinates = location.coordinates || {};
    const pricing = station.pricing || {};

    const approvalStatus = station.approvalStatus || 'PENDING';
    const inventoryStatus = station.inventoryStatus || 'AVAILABLE';

    const isApproved = approvalStatus === 'APPROVED';
    const isPending = approvalStatus === 'PENDING';

    const isActive = station.isActive === true;


    // ─────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────

    return (
        <main className="min-h-screen bg-slate-950 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">

                {/* BACK */}
                <button
                    type="button"
                    onClick={() => router.push('/admin/stations')}
                    className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
                >
                    <ArrowLeft size={17} />
                    Back to Stations
                </button>


                {/* HEADER */}
                <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/80">
                    <div className="p-5 sm:p-6">

                        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">

                            <div className="flex min-w-0 items-start gap-4">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                                    <TypeIcon size={27} />
                                </div>

                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="text-2xl font-bold tracking-tight text-white">
                                            {station.name}
                                        </h1>

                                        <StatusBadge
                                            styles={APPROVAL_STYLES[approvalStatus]}
                                        >
                                            {formatStatus(approvalStatus)}
                                        </StatusBadge>
                                    </div>

                                    <p className="mt-1 text-sm text-slate-500">
                                        {formatType(station.type)}
                                    </p>

                                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                                        {location.city || location.state ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <MapPin size={14} />
                                                {location.city || ''}
                                                {location.city && location.state ? ', ' : ''}
                                                {location.state || ''}
                                            </span>
                                        ) : null}

                                        {company?.name ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Building2 size={14} />
                                                {company.name}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>


                            {/* ACTIONS */}
                            <div className="flex flex-wrap gap-2">

                                <button
                                    type="button"
                                    onClick={() =>
                                        router.push(
                                            `/admin/stations/${station._id}/edit`
                                        )
                                    }
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
                                >
                                    <Pencil size={16} />
                                    Edit
                                </button>

                                <button
                                    type="button"
                                    disabled={refreshing}
                                    onClick={() => loadStation(true)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <RefreshCw
                                        size={16}
                                        className={refreshing ? 'animate-spin' : ''}
                                    />
                                    Refresh
                                </button>

                            </div>
                        </div>


                        {/* STATUS BAR */}
                        <div className="mt-6 grid gap-3 border-t border-slate-800 pt-5 sm:grid-cols-2 lg:grid-cols-4">

                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Approval
                                </p>

                                <div className="mt-2">
                                    <StatusBadge
                                        styles={APPROVAL_STYLES[approvalStatus]}
                                    >
                                        {formatStatus(approvalStatus)}
                                    </StatusBadge>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Inventory
                                </p>

                                <div className="mt-2">
                                    <StatusBadge
                                        styles={INVENTORY_STYLES[inventoryStatus]}
                                    >
                                        {formatStatus(inventoryStatus)}
                                    </StatusBadge>
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Station Status
                                </p>

                                <div className="mt-2 flex items-center gap-2">
                                    {isActive ? (
                                        <>
                                            <CheckCircle2
                                                size={16}
                                                className="text-emerald-400"
                                            />
                                            <span className="text-sm font-medium text-emerald-400">
                                                Active
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <PowerOff
                                                size={16}
                                                className="text-slate-500"
                                            />
                                            <span className="text-sm font-medium text-slate-400">
                                                Inactive
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                <p className="text-xs uppercase tracking-wide text-slate-500">
                                    Reach
                                </p>

                                <div className="mt-2 flex items-center gap-2">
                                    <Users
                                        size={16}
                                        className="text-emerald-400"
                                    />

                                    <span className="text-sm font-medium text-white">
                                        {station.reach || '—'}
                                    </span>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>


                {/* ERROR BANNER */}
                {error ? (
                    <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                        <XCircle
                            size={18}
                            className="mt-0.5 shrink-0 text-red-400"
                        />

                        <p className="text-sm text-red-300">
                            {error}
                        </p>
                    </div>
                ) : null}


                {/* ACTION PANEL */}
                <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                        <div>
                            <h2 className="text-sm font-semibold text-white">
                                Station Controls
                            </h2>

                            <p className="mt-1 text-xs text-slate-500">
                                Manage approval, activation and inventory status.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">

                            {isPending ? (
                                <>
                                    <button
                                        type="button"
                                        disabled={!!actionLoading}
                                        onClick={() => handleAction('approve')}
                                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <CheckCircle2 size={16} />
                                        {actionLoading === 'approve'
                                            ? 'Approving...'
                                            : 'Approve'}
                                    </button>

                                    <button
                                        type="button"
                                        disabled={!!actionLoading}
                                        onClick={() => handleAction('reject')}
                                        className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <XCircle size={16} />
                                        {actionLoading === 'reject'
                                            ? 'Rejecting...'
                                            : 'Reject'}
                                    </button>
                                </>
                            ) : null}

                            {isApproved && !isActive ? (
                                <button
                                    type="button"
                                    disabled={!!actionLoading}
                                    onClick={() => handleAction('activate')}
                                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Power size={16} />
                                    {actionLoading === 'activate'
                                        ? 'Activating...'
                                        : 'Activate'}
                                </button>
                            ) : null}

                            {isApproved && isActive ? (
                                <button
                                    type="button"
                                    disabled={!!actionLoading}
                                    onClick={() => handleAction('deactivate')}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <PowerOff size={16} />
                                    {actionLoading === 'deactivate'
                                        ? 'Deactivating...'
                                        : 'Deactivate'}
                                </button>
                            ) : null}

                            {inventoryStatus !== 'AVAILABLE' ? (
                                <button
                                    type="button"
                                    disabled={!!actionLoading}
                                    onClick={() => handleAction('available')}
                                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <CheckCircle2 size={16} />
                                    Available
                                </button>
                            ) : null}

                            {inventoryStatus !== 'MAINTENANCE' ? (
                                <button
                                    type="button"
                                    disabled={!!actionLoading}
                                    onClick={() => handleAction('maintenance')}
                                    className="inline-flex items-center gap-2 rounded-lg border border-orange-500/20 bg-orange-500/10 px-4 py-2.5 text-sm font-medium text-orange-400 transition hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Wrench size={16} />
                                    Maintenance
                                </button>
                            ) : null}

                            {inventoryStatus !== 'UNAVAILABLE' ? (
                                <button
                                    type="button"
                                    disabled={!!actionLoading}
                                    onClick={() => handleAction('unavailable')}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <PowerOff size={16} />
                                    Unavailable
                                </button>
                            ) : null}

                        </div>
                    </div>
                </div>


                {/* MAIN CONTENT */}
                <div className="grid gap-6 xl:grid-cols-3">

                    {/* LEFT COLUMN */}
                    <div className="space-y-6 xl:col-span-2">

                        <Section
                            title="Station Information"
                            icon={TypeIcon}
                        >
                            <InfoRow
                                label="Station Name"
                                value={station.name}
                            />

                            <InfoRow
                                label="Station Type"
                                value={formatType(station.type)}
                            />

                            <InfoRow
                                label="Description"
                                value={
                                    station.description ||
                                    'No description provided.'
                                }
                            />

                            <InfoRow
                                label="Slug"
                                value={station.slug}
                            />
                        </Section>


                        <Section
                            title="Media Company"
                            icon={Building2}
                        >
                            <InfoRow
                                label="Company"
                                value={getCompanyName(company)}
                            />

                            <InfoRow
                                label="Company Email"
                                value={
                                    typeof company === 'object'
                                        ? company?.email
                                        : null
                                }
                            />

                            <InfoRow
                                label="Company Phone"
                                value={
                                    typeof company === 'object'
                                        ? company?.phone
                                        : null
                                }
                            />

                            <InfoRow
                                label="Company Status"
                                value={
                                    typeof company === 'object'
                                        ? formatStatus(company?.status)
                                        : '—'
                                }
                            />
                        </Section>


                        <Section
                            title="Location"
                            icon={MapPin}
                        >
                            <InfoRow
                                label="Address"
                                value={location.address}
                            />

                            <InfoRow
                                label="City"
                                value={location.city}
                            />

                            <InfoRow
                                label="State"
                                value={location.state}
                            />

                            <InfoRow
                                label="Country"
                                value={location.country}
                            />

                            <InfoRow
                                label="Latitude"
                                value={coordinates.latitude}
                            />

                            <InfoRow
                                label="Longitude"
                                value={coordinates.longitude}
                            />

                            {(coordinates.latitude !== null &&
                                coordinates.latitude !== undefined &&
                                coordinates.longitude !== null &&
                                coordinates.longitude !== undefined) ? (
                                <div className="py-4">
                                    <a
                                        href={`https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
                                    >
                                        <MapPin size={16} />
                                        Open in Google Maps
                                        <ExternalLink size={14} />
                                    </a>
                                </div>
                            ) : null}
                        </Section>


                        <Section
                            title="Contact Information"
                            icon={Phone}
                        >
                            <InfoRow
                                label="Phone"
                                value={station.phone}
                            />

                            <InfoRow
                                label="Email"
                                value={station.email}
                            />

                            <InfoRow
                                label="Website"
                                value={station.website}
                            />

                            {station.website ? (
                                <div className="py-4">
                                    <a
                                        href={
                                            station.website.startsWith('http')
                                                ? station.website
                                                : `https://${station.website}`
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 text-sm text-emerald-400 transition hover:text-emerald-300"
                                    >
                                        <Globe size={16} />
                                        Visit Website
                                        <ExternalLink size={14} />
                                    </a>
                                </div>
                            ) : null}
                        </Section>


                        <Section
                            title="Advertising"
                            icon={Megaphone}
                        >
                            <InfoRow
                                label="Advertising Formats"
                                value={
                                    station.advertisingFormats?.length
                                        ? station.advertisingFormats.join(', ')
                                        : 'No advertising formats specified.'
                                }
                            />

                            <InfoRow
                                label="Features"
                                value={
                                    station.features?.length
                                        ? station.features.join(', ')
                                        : 'No features specified.'
                                }
                            />
                        </Section>


                        <Section
                            title="Specifications"
                            icon={Ruler}
                        >
                            {station.specifications &&
                            typeof station.specifications === 'object' &&
                            Object.keys(station.specifications).length > 0 ? (
                                Object.entries(station.specifications).map(
                                    ([key, value]) => (
                                        <InfoRow
                                            key={key}
                                            label={formatStatus(key)}
                                            value={
                                                value === null ||
                                                value === undefined ||
                                                value === ''
                                                    ? '—'
                                                    : String(value)
                                            }
                                        />
                                    )
                                )
                            ) : (
                                <EmptyState text="No specifications provided." />
                            )}
                        </Section>


                        <Section
                            title="Images"
                            icon={Monitor}
                        >
                            {station.coverImage ? (
                                <div className="py-5">
                                    <img
                                        src={station.coverImage}
                                        alt={station.name}
                                        className="h-64 w-full rounded-xl object-cover"
                                    />
                                </div>
                            ) : null}

                            {station.images?.length ? (
                                <div className="grid grid-cols-2 gap-3 py-5 sm:grid-cols-3">
                                    {station.images.map((image, index) => (
                                        <img
                                            key={`${image}-${index}`}
                                            src={image}
                                            alt={`${station.name} ${index + 1}`}
                                            className="aspect-video w-full rounded-xl object-cover"
                                        />
                                    ))}
                                </div>
                            ) : !station.coverImage ? (
                                <EmptyState text="No station images uploaded." />
                            ) : null}
                        </Section>

                    </div>


                    {/* RIGHT COLUMN */}
                    <div className="space-y-6">

                        <Section
                            title="Pricing"
                            icon={Megaphone}
                        >
                            <InfoRow
                                label="Price"
                                value={formatPrice(pricing)}
                            />

                            <InfoRow
                                label="Billing Unit"
                                value={formatStatus(pricing.unit)}
                            />

                            <InfoRow
                                label="Currency"
                                value={pricing.currency}
                            />
                        </Section>


                        <Section
                            title="Operating Hours"
                            icon={Clock3}
                        >
                            {station.operatingHours &&
                            typeof station.operatingHours === 'object' &&
                            Object.keys(station.operatingHours).length > 0 ? (
                                Object.entries(
                                    station.operatingHours
                                ).map(([day, hours]) => (
                                    <InfoRow
                                        key={day}
                                        label={formatStatus(day)}
                                        value={
                                            typeof hours === 'object'
                                                ? JSON.stringify(hours)
                                                : String(hours)
                                        }
                                    />
                                ))
                            ) : (
                                <EmptyState text="No operating hours provided." />
                            )}
                        </Section>


                        <Section
                            title="Availability"
                            icon={CalendarDays}
                        >
                            {station.availability &&
                            typeof station.availability === 'object' &&
                            Object.keys(station.availability).length > 0 ? (
                                Object.entries(
                                    station.availability
                                ).map(([key, value]) => (
                                    <InfoRow
                                        key={key}
                                        label={formatStatus(key)}
                                        value={
                                            typeof value === 'object'
                                                ? JSON.stringify(value)
                                                : String(value)
                                        }
                                    />
                                ))
                            ) : (
                                <EmptyState text="No availability rules configured." />
                            )}
                        </Section>


                        <Section
                            title="Marketplace"
                            icon={Users}
                        >
                            <InfoRow
                                label="Reach"
                                value={station.reach}
                            />

                            <InfoRow
                                label="Rating"
                                value={
                                    station.rating !== undefined &&
                                    station.rating !== null
                                        ? `${station.rating} / 5`
                                        : '—'
                                }
                            />

                            <InfoRow
                                label="Reviews"
                                value={
                                    station.reviews !== undefined &&
                                    station.reviews !== null
                                        ? station.reviews.toLocaleString()
                                        : '—'
                                }
                            />
                        </Section>


                        <Section
                            title="Social Links"
                            icon={Globe}
                        >
                            {station.social &&
                            typeof station.social === 'object' &&
                            Object.keys(station.social).length > 0 ? (
                                Object.entries(station.social).map(
                                    ([key, value]) => (
                                        <InfoRow
                                            key={key}
                                            label={formatStatus(key)}
                                            value={String(value)}
                                        />
                                    )
                                )
                            ) : (
                                <EmptyState text="No social links provided." />
                            )}
                        </Section>


                        <Section
                            title="Record Information"
                            icon={CalendarDays}
                        >
                            <InfoRow
                                label="Created"
                                value={formatDateTime(station.createdAt)}
                            />

                            <InfoRow
                                label="Last Updated"
                                value={formatDateTime(station.updatedAt)}
                            />

                            <InfoRow
                                label="Station ID"
                                value={station._id}
                            />

                            <InfoRow
                                label="Created Date"
                                value={formatDate(station.createdAt)}
                            />
                        </Section>

                    </div>
                </div>
            </div>
        </main>
    );
}