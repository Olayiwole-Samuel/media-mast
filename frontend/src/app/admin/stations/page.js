'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
    Search,
    Plus,
    RefreshCw,
    MapPin,
    Building2,
    Tv,
    Radio,
    Newspaper,
    Monitor,
    Megaphone,
    MoreVertical,
    Eye,
    Pencil,
    CheckCircle2,
    XCircle,
    Power,
    PowerOff,
    Wrench,
    LayoutGrid,
    List,
    X,
    ChevronDown,
} from 'lucide-react';

import {
    getAdminStations,
    getAdminCompanies,
    createAdminStation,
    approveAdminStation,
    rejectAdminStation,
    activateAdminStation,
    deactivateAdminStation,
    updateAdminStationInventoryStatus,
} from '@/lib/api';


// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const STATION_TYPES = [
    'ALL',
    'TV',
    'RADIO',
    'PRESS',
    'BILLBOARD',
    'DIGITAL',
];

const APPROVAL_STATUSES = [
    'ALL',
    'PENDING',
    'APPROVED',
    'REJECTED',
];

const INVENTORY_STATUSES = [
    'ALL',
    'AVAILABLE',
    'BOOKED',
    'UNAVAILABLE',
    'MAINTENANCE',
];

const INITIAL_FORM = {
    name: '',
    type: 'TV',
    description: '',
    companyId: '',

    location: {
        address: '',
        city: '',
        state: '',
        country: 'Nigeria',

        coordinates: {
            latitude: '',
            longitude: '',
        },
    },

    phone: '',
    email: '',
    website: '',

    advertisingFormats: '',
    features: '',

    specifications: {
        size: '',
        resolution: '',
        audience: '',
    },

    pricing: {
        amount: '',
        currency: 'NGN',
        unit: 'WEEK',
    },

    reach: '',
};


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const getTypeIcon = (type) => {
    switch (type) {
        case 'TV':
            return Tv;

        case 'RADIO':
            return Radio;

        case 'PRESS':
            return Newspaper;

        case 'BILLBOARD':
            return Megaphone;

        case 'DIGITAL':
            return Monitor;

        default:
            return Building2;
    }
};

const formatType = (type) => {
    if (!type) return 'Unknown';

    return type
        .toLowerCase()
        .replace('_', ' ')
        .replace(/\b\w/g, (letter) =>
            letter.toUpperCase()
        );
};

const formatStatus = (status) => {
    if (!status) return 'Unknown';

    return status
        .toLowerCase()
        .replace('_', ' ')
        .replace(/\b\w/g, (letter) =>
            letter.toUpperCase()
        );
};

const getApprovalClasses = (status) => {
    switch (status) {
        case 'APPROVED':
            return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

        case 'PENDING':
            return 'bg-amber-500/10 text-amber-400 border-amber-500/20';

        case 'REJECTED':
            return 'bg-red-500/10 text-red-400 border-red-500/20';

        default:
            return 'bg-slate-800 text-slate-400 border-slate-700';
    }
};

const getInventoryClasses = (status) => {
    switch (status) {
        case 'AVAILABLE':
            return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

        case 'BOOKED':
            return 'bg-blue-500/10 text-blue-400 border-blue-500/20';

        case 'MAINTENANCE':
            return 'bg-amber-500/10 text-amber-400 border-amber-500/20';

        case 'UNAVAILABLE':
            return 'bg-red-500/10 text-red-400 border-red-500/20';

        default:
            return 'bg-slate-800 text-slate-400 border-slate-700';
    }
};

const formatLocation = (station) => {
    const location = station?.location;

    if (!location) {
        return 'Location not specified';
    }

    const parts = [
        location.city,
        location.state,
        location.country,
    ].filter(Boolean);

    return parts.length
        ? parts.join(', ')
        : location.address || 'Location not specified';
};

const getCompanyName = (station) => {
    // No media company: the station is run by its station managers.
    if (!station?.companyId) {
        return 'No media company';
    }

    if (typeof station.companyId === 'object') {
        return (
            station.companyId.name ||
            'Unknown company'
        );
    }

    return 'Unknown company';
};

const formatPrice = (station) => {
    const amount = Number(
        station?.pricing?.amount || 0
    );

    const currency =
        station?.pricing?.currency || 'NGN';

    const unit =
        station?.pricing?.unit || 'WEEK';

    return `${currency} ${amount.toLocaleString()} / ${unit.toLowerCase()}`;
};


// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────

export default function AdminStationsPage() {
    const router = useRouter();
    const [stations, setStations] = useState([]);
    const [companies, setCompanies] = useState([]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [error, setError] = useState('');

    const [search, setSearch] = useState('');

    const [typeFilter, setTypeFilter] =
        useState('ALL');

    const [approvalFilter, setApprovalFilter] =
        useState('ALL');

    const [inventoryFilter, setInventoryFilter] =
        useState('ALL');

    const [viewMode, setViewMode] =
        useState('grid');

    const [openMenu, setOpenMenu] =
        useState(null);

    const [actionLoading, setActionLoading] =
        useState(null);

    // CREATE FORM
    const [showCreateForm, setShowCreateForm] =
        useState(false);

    const [creating, setCreating] =
        useState(false);

    const [createError, setCreateError] =
        useState('');

    const [form, setForm] =
        useState(INITIAL_FORM);


    // ─────────────────────────────────────────
    // LOAD STATIONS
    // ─────────────────────────────────────────

    const loadStations = async (
        showRefresh = false
    ) => {
        try {
            if (showRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            setError('');

            const response =
                await getAdminStations();

            setStations(
                Array.isArray(response?.data)
                    ? response.data
                    : []
            );
        } catch (err) {
            console.error(
                'Failed to load stations:',
                err
            );

            setError(
                err?.message ||
                'Failed to load stations'
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };


    // ─────────────────────────────────────────
    // LOAD COMPANIES
    // ─────────────────────────────────────────

    const loadCompanies = async () => {
        try {
            const response =
                await getAdminCompanies();

            setCompanies(
                Array.isArray(response?.data)
                    ? response.data
                    : []
            );
        } catch (err) {
            console.error(
                'Failed to load companies:',
                err
            );
        }
    };


    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadStations();
        loadCompanies();
    }, []);


    // ─────────────────────────────────────────
    // FORM HANDLERS
    // ─────────────────────────────────────────

    const handleFormChange = (
        field,
        value
    ) => {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const handleLocationChange = (
        field,
        value
    ) => {
        setForm((current) => ({
            ...current,

            location: {
                ...current.location,
                [field]: value,
            },
        }));
    };

    const handleCoordinateChange = (
        field,
        value
    ) => {
        setForm((current) => ({
            ...current,

            location: {
                ...current.location,

                coordinates: {
                    ...current.location.coordinates,
                    [field]: value,
                },
            },
        }));
    };

    const handleSpecificationChange = (
        field,
        value
    ) => {
        setForm((current) => ({
            ...current,

            specifications: {
                ...current.specifications,
                [field]: value,
            },
        }));
    };

    const handlePricingChange = (
        field,
        value
    ) => {
        setForm((current) => ({
            ...current,

            pricing: {
                ...current.pricing,
                [field]: value,
            },
        }));
    };


    const resetCreateForm = () => {
        setForm({
            ...INITIAL_FORM,

            location: {
                ...INITIAL_FORM.location,

                coordinates: {
                    ...INITIAL_FORM.location.coordinates,
                },
            },

            specifications: {
                ...INITIAL_FORM.specifications,
            },

            pricing: {
                ...INITIAL_FORM.pricing,
            },
        });

        setCreateError('');
    };


    // ─────────────────────────────────────────
    // CREATE STATION
    // ─────────────────────────────────────────

    const handleCreateStation = async (
        event
    ) => {
        event.preventDefault();

        try {
            setCreating(true);
            setCreateError('');

            // Basic validation
            if (!form.name.trim()) {
                setCreateError(
                    'Station name is required.'
                );
                return;
            }

            if (!form.type) {
                setCreateError(
                    'Station type is required.'
                );
                return;
            }

            // A media company is optional: stations are run by Media
            // Masters and their assigned station managers.

            if (
                form.pricing.amount !== '' &&
                Number(form.pricing.amount) < 0
            ) {
                setCreateError(
                    'Pricing amount cannot be negative.'
                );
                return;
            }

            const payload = {
                name: form.name.trim(),

                type: form.type,

                description:
                    form.description.trim() ||
                    null,

                ...(form.companyId ? { companyId: form.companyId } : {}),

                location: {
                    address:
                        form.location.address.trim() ||
                        null,

                    city:
                        form.location.city.trim() ||
                        null,

                    state:
                        form.location.state.trim() ||
                        null,

                    country:
                        form.location.country.trim() ||
                        'Nigeria',

                    coordinates: {
                        latitude:
                            form.location.coordinates.latitude === ''
                                ? null
                                : Number(
                                    form.location.coordinates.latitude
                                ),

                        longitude:
                            form.location.coordinates.longitude === ''
                                ? null
                                : Number(
                                    form.location.coordinates.longitude
                                ),
                    },
                },

                phone:
                    form.phone.trim() ||
                    null,

                email:
                    form.email.trim() ||
                    null,

                website:
                    form.website.trim() ||
                    null,

                advertisingFormats:
                    form.advertisingFormats
                        .split(',')
                        .map((item) =>
                            item.trim()
                        )
                        .filter(Boolean),

                features:
                    form.features
                        .split(',')
                        .map((item) =>
                            item.trim()
                        )
                        .filter(Boolean),

                specifications: {
                    size:
                        form.specifications.size.trim() ||
                        null,

                    resolution:
                        form.specifications.resolution.trim() ||
                        null,

                    audience:
                        form.specifications.audience.trim() ||
                        null,
                },

                pricing: {
                    amount:
                        form.pricing.amount === ''
                            ? 0
                            : Number(
                                form.pricing.amount
                            ),

                    currency:
                        form.pricing.currency
                            .trim()
                            .toUpperCase(),

                    unit:
                        form.pricing.unit,
                },

                reach:
                    form.reach.trim() ||
                    null,
            };

            const response =
                await createAdminStation(
                    payload
                );

            const newStation =
                response?.data;

            if (newStation) {
                setStations((current) => [
                    newStation,
                    ...current,
                ]);
            } else {
                await loadStations();
            }

            setShowCreateForm(false);

            resetCreateForm();

        } catch (err) {
            console.error(
                'Failed to create station:',
                err
            );

            setCreateError(
                err?.message ||
                'Failed to create station.'
            );
        } finally {
            setCreating(false);
        }
    };


    // ─────────────────────────────────────────
    // FILTERING
    // ─────────────────────────────────────────

    const filteredStations = useMemo(() => {
        const query =
            search.trim().toLowerCase();

        return stations.filter((station) => {
            const companyName =
                getCompanyName(station);

            const location =
                station?.location || {};

            const matchesSearch =
                !query ||
                station?.name
                    ?.toLowerCase()
                    .includes(query) ||
                station?.type
                    ?.toLowerCase()
                    .includes(query) ||
                companyName
                    ?.toLowerCase()
                    .includes(query) ||
                location?.city
                    ?.toLowerCase()
                    .includes(query) ||
                location?.state
                    ?.toLowerCase()
                    .includes(query);

            const matchesType =
                typeFilter === 'ALL' ||
                station?.type === typeFilter;

            const matchesApproval =
                approvalFilter === 'ALL' ||
                station?.approvalStatus ===
                approvalFilter;

            const matchesInventory =
                inventoryFilter === 'ALL' ||
                station?.inventoryStatus ===
                inventoryFilter;

            return (
                matchesSearch &&
                matchesType &&
                matchesApproval &&
                matchesInventory
            );
        });
    }, [
        stations,
        search,
        typeFilter,
        approvalFilter,
        inventoryFilter,
    ]);


    // ─────────────────────────────────────────
    // STATS
    // ─────────────────────────────────────────

    const stats = useMemo(() => {
        return {
            total: stations.length,

            pending: stations.filter(
                (station) =>
                    station.approvalStatus ===
                    'PENDING'
            ).length,

            approved: stations.filter(
                (station) =>
                    station.approvalStatus ===
                    'APPROVED'
            ).length,

            available: stations.filter(
                (station) =>
                    station.inventoryStatus ===
                    'AVAILABLE'
            ).length,

            booked: stations.filter(
                (station) =>
                    station.inventoryStatus ===
                    'BOOKED'
            ).length,

            maintenance: stations.filter(
                (station) =>
                    station.inventoryStatus ===
                    'MAINTENANCE'
            ).length,
        };
    }, [stations]);


    // ─────────────────────────────────────────
    // ACTIONS
    // ─────────────────────────────────────────

    const handleAction = async (
        action,
        station
    ) => {
        const id = station?._id;

        if (!id) return;

        try {
            setActionLoading(
                `${action}-${id}`
            );

            setOpenMenu(null);

            let response;

            switch (action) {
                case 'approve':
                    response =
                        await approveAdminStation(
                            id
                        );
                    break;

                case 'reject':
                    response =
                        await rejectAdminStation(
                            id
                        );
                    break;

                case 'activate':
                    response =
                        await activateAdminStation(
                            id
                        );
                    break;

                case 'deactivate':
                    response =
                        await deactivateAdminStation(
                            id
                        );
                    break;

                case 'available':
                    response =
                        await updateAdminStationInventoryStatus(
                            id,
                            'AVAILABLE'
                        );
                    break;

                case 'maintenance':
                    response =
                        await updateAdminStationInventoryStatus(
                            id,
                            'MAINTENANCE'
                        );
                    break;

                case 'unavailable':
                    response =
                        await updateAdminStationInventoryStatus(
                            id,
                            'UNAVAILABLE'
                        );
                    break;

                default:
                    return;
            }

            const updatedStation =
                response?.data;

            if (updatedStation?._id) {
                setStations((current) =>
                    current.map((item) =>
                        item._id ===
                            updatedStation._id
                            ? updatedStation
                            : item
                    )
                );
            } else {
                await loadStations();
            }

        } catch (err) {
            console.error(
                `Failed to ${action} station:`,
                err
            );

            setError(
                err?.message ||
                `Failed to ${action} station`
            );
        } finally {
            setActionLoading(null);
        }
    };


    // ─────────────────────────────────────────
    // INPUT COMPONENT
    // ─────────────────────────────────────────

    const inputClass =
        'w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10';

    const selectClass =
        'w-full appearance-none rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-3 text-sm text-white outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10';

    const MENU_ITEM =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition';

    // ─────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────

    return (
        <div className="min-h-screen bg-slate-950 text-white">

            {/* PAGE CONTENT */}
            <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">

                {/* HEADER */}
                <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white">
                            Stations
                        </h1>

                        <p className="mt-1 text-sm text-slate-400">
                            Manage media stations and advertising inventory.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">

                        <button
                            type="button"
                            onClick={() =>
                                loadStations(true)
                            }
                            disabled={refreshing}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <RefreshCw
                                size={16}
                                className={
                                    refreshing
                                        ? 'animate-spin'
                                        : ''
                                }
                            />

                            <span className="hidden sm:inline">
                                Refresh
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                resetCreateForm();
                                setShowCreateForm(true);
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                        >
                            <Plus size={17} />

                            Add Station
                        </button>

                    </div>
                </div>


                {/* ERROR */}
                {error && (
                    <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">

                        <span>
                            {error}
                        </span>

                        <button
                            type="button"
                            onClick={() =>
                                setError('')
                            }
                            className="text-red-300 transition hover:text-white"
                        >
                            <X size={17} />
                        </button>

                    </div>
                )}


                {/* STATS */}
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">

                    {[
                        {
                            label: 'Total',
                            value: stats.total,
                        },
                        {
                            label: 'Pending',
                            value: stats.pending,
                        },
                        {
                            label: 'Approved',
                            value: stats.approved,
                        },
                        {
                            label: 'Available',
                            value: stats.available,
                        },
                        {
                            label: 'Booked',
                            value: stats.booked,
                        },
                        {
                            label: 'Maintenance',
                            value: stats.maintenance,
                        },
                    ].map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
                        >
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                {stat.label}
                            </p>

                            <p className="mt-2 text-2xl font-bold text-white">
                                {stat.value}
                            </p>
                        </div>
                    ))}

                </div>


                {/* FILTER BAR */}
                <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">

                    <div className="flex flex-col gap-3 xl:flex-row">

                        {/* SEARCH */}
                        <div className="relative flex-1">

                            <Search
                                size={17}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                            />

                            <input
                                type="text"
                                value={search}
                                onChange={(event) =>
                                    setSearch(
                                        event.target.value
                                    )
                                }
                                placeholder="Search stations, companies, cities..."
                                className={`${inputClass} pl-10`}
                            />

                        </div>


                        {/* TYPE */}
                        <div className="relative">

                            <select
                                value={typeFilter}
                                onChange={(event) =>
                                    setTypeFilter(
                                        event.target.value
                                    )
                                }
                                className={`${selectClass} min-w-[150px] pr-10`}
                            >
                                {STATION_TYPES.map(
                                    (type) => (
                                        <option
                                            key={type}
                                            value={type}
                                        >
                                            {type ===
                                                'ALL'
                                                ? 'All Types'
                                                : formatType(
                                                    type
                                                )}
                                        </option>
                                    )
                                )}
                            </select>

                            <ChevronDown
                                size={16}
                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                            />

                        </div>


                        {/* APPROVAL */}
                        <div className="relative">

                            <select
                                value={approvalFilter}
                                onChange={(event) =>
                                    setApprovalFilter(
                                        event.target.value
                                    )
                                }
                                className={`${selectClass} min-w-[165px] pr-10`}
                            >
                                {APPROVAL_STATUSES.map(
                                    (status) => (
                                        <option
                                            key={status}
                                            value={status}
                                        >
                                            {status ===
                                                'ALL'
                                                ? 'All Approval'
                                                : formatStatus(
                                                    status
                                                )}
                                        </option>
                                    )
                                )}
                            </select>

                            <ChevronDown
                                size={16}
                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                            />

                        </div>


                        {/* INVENTORY */}
                        <div className="relative">

                            <select
                                value={inventoryFilter}
                                onChange={(event) =>
                                    setInventoryFilter(
                                        event.target.value
                                    )
                                }
                                className={`${selectClass} min-w-[170px] pr-10`}
                            >
                                {INVENTORY_STATUSES.map(
                                    (status) => (
                                        <option
                                            key={status}
                                            value={status}
                                        >
                                            {status ===
                                                'ALL'
                                                ? 'All Inventory'
                                                : formatStatus(
                                                    status
                                                )}
                                        </option>
                                    )
                                )}
                            </select>

                            <ChevronDown
                                size={16}
                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                            />

                        </div>


                        {/* VIEW TOGGLE */}
                        <div className="flex items-center rounded-xl border border-slate-800 bg-slate-950 p-1">

                            <button
                                type="button"
                                onClick={() =>
                                    setViewMode(
                                        'grid'
                                    )
                                }
                                className={`rounded-lg p-2 transition ${viewMode ===
                                        'grid'
                                        ? 'bg-slate-800 text-white'
                                        : 'text-slate-500 hover:text-white'
                                    }`}
                            >
                                <LayoutGrid
                                    size={17}
                                />
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    setViewMode(
                                        'list'
                                    )
                                }
                                className={`rounded-lg p-2 transition ${viewMode ===
                                        'list'
                                        ? 'bg-slate-800 text-white'
                                        : 'text-slate-500 hover:text-white'
                                    }`}
                            >
                                <List size={17} />
                            </button>

                        </div>

                    </div>
                </div>


                {/* LOADING */}
                {loading ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

                        {[1, 2, 3, 4, 5, 6].map(
                            (item) => (
                                <div
                                    key={item}
                                    className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900"
                                />
                            )
                        )}

                    </div>
                ) : filteredStations.length === 0 ? (

                    /* EMPTY STATE */
                    <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 px-6 py-16 text-center">

                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-500">
                            <Building2
                                size={26}
                            />
                        </div>

                        <h3 className="mt-4 text-base font-semibold text-white">
                            No stations found
                        </h3>

                        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                            {stations.length === 0
                                ? 'There are no stations yet. Create your first station to start managing advertising inventory.'
                                : 'No stations match your current search or filters.'}
                        </p>

                        {stations.length ===
                            0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        resetCreateForm();
                                        setShowCreateForm(
                                            true
                                        );
                                    }}
                                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                                >
                                    <Plus size={17} />

                                    Add Station
                                </button>
                            )}

                    </div>
                ) : viewMode === 'grid' ? (

                    /* GRID */
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

                        {filteredStations.map(
                            (station) => {
                                const TypeIcon =
                                    getTypeIcon(
                                        station.type
                                    );

                                const isActionLoading =
                                    actionLoading?.endsWith(
                                        station._id
                                    );

                                return (
                                    <div
                                        key={
                                            station._id
                                        }
                                        className="group relative rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-slate-700"
                                    >

                                        {/* TOP */}
                                        <div className="flex items-start justify-between gap-3">

                                            <div className="flex min-w-0 items-center gap-3">

                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                                                    <TypeIcon
                                                        size={
                                                            20
                                                        }
                                                    />
                                                </div>

                                                <div className="min-w-0">
                                                    <h3 className="truncate text-sm font-semibold text-white">
                                                        {
                                                            station.name
                                                        }
                                                    </h3>

                                                    <p className="mt-0.5 text-xs text-slate-500">
                                                        {
                                                            formatType(
                                                                station.type
                                                            )
                                                        }
                                                    </p>
                                                </div>

                                            </div>


                                            {/* MENU */}
                                            <div className="relative">

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setOpenMenu(
                                                            openMenu ===
                                                                station._id
                                                                ? null
                                                                : station._id
                                                        )
                                                    }
                                                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-white"
                                                >
                                                    <MoreVertical
                                                        size={
                                                            18
                                                        }
                                                    />
                                                </button>

                                                {openMenu ===
                                                    station._id && (
                                                        <div className="absolute right-0 top-10 z-30 w-52 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-1.5 shadow-2xl">

                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setOpenMenu(null);
                                                                    router.push(`/admin/stations/${station._id}`);
                                                                }}
                                                                className={`${MENU_ITEM} text-slate-300 hover:bg-slate-800 hover:text-white`}
                                                            >
                                                                <Eye size={16} />
                                                                View Station
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setOpenMenu(
                                                                        null
                                                                    )
                                                                }
                                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                                                            >
                                                                <Pencil
                                                                    size={
                                                                        16
                                                                    }
                                                                />

                                                                Edit Station
                                                            </button>

                                                            <div className="my-1 border-t border-slate-800" />

                                                            {station.approvalStatus ===
                                                                'PENDING' && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            disabled={
                                                                                isActionLoading
                                                                            }
                                                                            onClick={() =>
                                                                                handleAction(
                                                                                    'approve',
                                                                                    station
                                                                                )
                                                                            }
                                                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-50"
                                                                        >
                                                                            <CheckCircle2
                                                                                size={
                                                                                    16
                                                                                }
                                                                            />

                                                                            Approve
                                                                        </button>

                                                                        <button
                                                                            type="button"
                                                                            disabled={
                                                                                isActionLoading
                                                                            }
                                                                            onClick={() =>
                                                                                handleAction(
                                                                                    'reject',
                                                                                    station
                                                                                )
                                                                            }
                                                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                                                                        >
                                                                            <XCircle
                                                                                size={
                                                                                    16
                                                                                }
                                                                            />

                                                                            Reject
                                                                        </button>
                                                                    </>
                                                                )}

                                                            {station.approvalStatus ===
                                                                'APPROVED' && (
                                                                    <>
                                                                        {station.isActive ? (
                                                                            <button
                                                                                type="button"
                                                                                disabled={
                                                                                    isActionLoading
                                                                                }
                                                                                onClick={() =>
                                                                                    handleAction(
                                                                                        'deactivate',
                                                                                        station
                                                                                    )
                                                                                }
                                                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-amber-400 transition hover:bg-amber-500/10 disabled:opacity-50"
                                                                            >
                                                                                <PowerOff
                                                                                    size={
                                                                                        16
                                                                                    }
                                                                                />

                                                                                Deactivate
                                                                            </button>
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                disabled={
                                                                                    isActionLoading
                                                                                }
                                                                                onClick={() =>
                                                                                    handleAction(
                                                                                        'activate',
                                                                                        station
                                                                                    )
                                                                                }
                                                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-50"
                                                                            >
                                                                                <Power
                                                                                    size={
                                                                                        16
                                                                                    }
                                                                                />

                                                                                Activate
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                )}

                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    isActionLoading
                                                                }
                                                                onClick={() =>
                                                                    handleAction(
                                                                        'maintenance',
                                                                        station
                                                                    )
                                                                }
                                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-amber-400 transition hover:bg-amber-500/10 disabled:opacity-50"
                                                            >
                                                                <Wrench
                                                                    size={
                                                                        16
                                                                    }
                                                                />

                                                                Set Maintenance
                                                            </button>

                                                        </div>
                                                    )}

                                            </div>

                                        </div>


                                        {/* COMPANY */}
                                        <div className="mt-5 flex items-center gap-2 text-sm text-slate-400">
                                            <Building2
                                                size={15}
                                                className="shrink-0 text-slate-600"
                                            />

                                            <span className="truncate">
                                                {getCompanyName(
                                                    station
                                                )}
                                            </span>
                                        </div>


                                        {/* LOCATION */}
                                        <div className="mt-2 flex items-start gap-2 text-sm text-slate-400">
                                            <MapPin
                                                size={15}
                                                className="mt-0.5 shrink-0 text-slate-600"
                                            />

                                            <span className="line-clamp-2">
                                                {formatLocation(
                                                    station
                                                )}
                                            </span>
                                        </div>


                                        {/* PRICE */}
                                        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5">
                                            <p className="text-xs text-slate-500">
                                                Starting price
                                            </p>

                                            <p className="mt-0.5 text-sm font-semibold text-white">
                                                {formatPrice(
                                                    station
                                                )}
                                            </p>
                                        </div>


                                        {/* STATUS */}
                                        <div className="mt-4 flex flex-wrap gap-2">

                                            <span
                                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getApprovalClasses(
                                                    station.approvalStatus
                                                )}`}
                                            >
                                                {formatStatus(
                                                    station.approvalStatus
                                                )}
                                            </span>

                                            <span
                                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getInventoryClasses(
                                                    station.inventoryStatus
                                                )}`}
                                            >
                                                {formatStatus(
                                                    station.inventoryStatus
                                                )}
                                            </span>

                                        </div>

                                    </div>
                                );
                            }
                        )}

                    </div>
                ) : (

                    /* LIST */
                    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">

                        <div className="hidden grid-cols-[2fr_1.4fr_1.4fr_1.2fr_1.2fr_auto] gap-4 border-b border-slate-800 bg-slate-950/60 px-5 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 lg:grid">

                            <span>Station</span>
                            <span>Company</span>
                            <span>Location</span>
                            <span>Approval</span>
                            <span>Inventory</span>
                            <span />

                        </div>

                        {filteredStations.map(
                            (station) => {
                                const TypeIcon =
                                    getTypeIcon(
                                        station.type
                                    );

                                return (
                                    <div
                                        key={
                                            station._id
                                        }
                                        className="grid gap-4 border-b border-slate-800 px-5 py-4 last:border-b-0 lg:grid-cols-[2fr_1.4fr_1.4fr_1.2fr_1.2fr_auto] lg:items-center"
                                    >

                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                                                <TypeIcon
                                                    size={
                                                        18
                                                    }
                                                />
                                            </div>

                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-white">
                                                    {
                                                        station.name
                                                    }
                                                </p>

                                                <p className="text-xs text-slate-500">
                                                    {
                                                        formatType(
                                                            station.type
                                                        )
                                                    }
                                                </p>
                                            </div>
                                        </div>

                                        <div className="text-sm text-slate-400">
                                            {getCompanyName(
                                                station
                                            )}
                                        </div>

                                        <div className="text-sm text-slate-400">
                                            {formatLocation(
                                                station
                                            )}
                                        </div>

                                        <div>
                                            <span
                                                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getApprovalClasses(
                                                    station.approvalStatus
                                                )}`}
                                            >
                                                {formatStatus(
                                                    station.approvalStatus
                                                )}
                                            </span>
                                        </div>

                                        <div>
                                            <span
                                                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${getInventoryClasses(
                                                    station.inventoryStatus
                                                )}`}
                                            >
                                                {formatStatus(
                                                    station.inventoryStatus
                                                )}
                                            </span>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setOpenMenu(
                                                    openMenu ===
                                                        station._id
                                                        ? null
                                                        : station._id
                                                )
                                            }
                                            className="justify-self-start rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-white lg:justify-self-end"
                                        >
                                            <MoreVertical
                                                size={
                                                    18
                                                }
                                            />
                                        </button>

                                    </div>
                                );
                            }
                        )}

                    </div>
                )}

            </div>


            {/* ─────────────────────────────────── */}
            {/* CREATE STATION SLIDE-OVER */}
            {/* ─────────────────────────────────── */}

            {showCreateForm && (
                <div className="fixed inset-0 z-50">

                    {/* BACKDROP */}
                    <button
                        type="button"
                        aria-label="Close create station form"
                        onClick={() => {
                            if (!creating) {
                                setShowCreateForm(
                                    false
                                );
                                resetCreateForm();
                            }
                        }}
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                    />

                    {/* PANEL */}
                    <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-slate-800 bg-slate-950 shadow-2xl">

                        {/* PANEL HEADER */}
                        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-4 sm:px-6">

                            <div>
                                <h2 className="text-lg font-semibold text-white">
                                    Add Station
                                </h2>

                                <p className="mt-0.5 text-xs text-slate-500">
                                    Create a new advertising station.
                                </p>
                            </div>

                            <button
                                type="button"
                                disabled={
                                    creating
                                }
                                onClick={() => {
                                    setShowCreateForm(
                                        false
                                    );
                                    resetCreateForm();
                                }}
                                className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
                            >
                                <X size={18} />
                            </button>

                        </div>


                        {/* FORM */}
                        <form
                            onSubmit={
                                handleCreateStation
                            }
                            className="flex min-h-0 flex-1 flex-col"
                        >

                            {/* FORM CONTENT */}
                            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">

                                {/* ERROR */}
                                {createError && (
                                    <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                        {
                                            createError
                                        }
                                    </div>
                                )}


                                {/* BASIC INFORMATION */}
                                <section>

                                    <div className="mb-4">
                                        <h3 className="text-sm font-semibold text-white">
                                            Basic Information
                                        </h3>

                                        <p className="mt-1 text-xs text-slate-500">
                                            Identify the station and assign its media company.
                                        </p>
                                    </div>


                                    <div className="space-y-4">

                                        {/* NAME */}
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Station Name
                                                <span className="ml-1 text-emerald-400">
                                                    *
                                                </span>
                                            </label>

                                            <input
                                                type="text"
                                                value={
                                                    form.name
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    handleFormChange(
                                                        'name',
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                placeholder="e.g. Channels TV Lagos"
                                                className={
                                                    inputClass
                                                }
                                            />
                                        </div>


                                        {/* TYPE + COMPANY */}
                                        <div className="grid gap-4 sm:grid-cols-2">

                                            <div>
                                                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                    Station Type
                                                    <span className="ml-1 text-emerald-400">
                                                        *
                                                    </span>
                                                </label>

                                                <div className="relative">
                                                    <select
                                                        value={
                                                            form.type
                                                        }
                                                        onChange={(
                                                            event
                                                        ) =>
                                                            handleFormChange(
                                                                'type',
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                        className={`${selectClass} pr-10`}
                                                    >
                                                        {STATION_TYPES.filter(
                                                            (
                                                                type
                                                            ) =>
                                                                type !==
                                                                'ALL'
                                                        ).map(
                                                            (
                                                                type
                                                            ) => (
                                                                <option
                                                                    key={
                                                                        type
                                                                    }
                                                                    value={
                                                                        type
                                                                    }
                                                                >
                                                                    {formatType(
                                                                        type
                                                                    )}
                                                                </option>
                                                            )
                                                        )}
                                                    </select>

                                                    <ChevronDown
                                                        size={
                                                            16
                                                        }
                                                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                                                    />
                                                </div>
                                            </div>


                                            <div>
                                                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                    Media Company
                                                    <span className="ml-1 text-emerald-400">
                                                        *
                                                    </span>
                                                </label>

                                                <div className="relative">
                                                    <select
                                                        value={
                                                            form.companyId
                                                        }
                                                        onChange={(
                                                            event
                                                        ) =>
                                                            handleFormChange(
                                                                'companyId',
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                        className={`${selectClass} pr-10`}
                                                    >
                                                        <option value="">
                                                            Select company
                                                        </option>

                                                        {companies.map(
                                                            (
                                                                company
                                                            ) => (
                                                                <option
                                                                    key={
                                                                        company._id
                                                                    }
                                                                    value={
                                                                        company._id
                                                                    }
                                                                >
                                                                    {
                                                                        company.name
                                                                    }
                                                                </option>
                                                            )
                                                        )}
                                                    </select>

                                                    <ChevronDown
                                                        size={
                                                            16
                                                        }
                                                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                                                    />
                                                </div>

                                                {companies.length ===
                                                    0 && (
                                                        <p className="mt-1.5 text-[11px] text-amber-400">
                                                            No media companies available.
                                                        </p>
                                                    )}
                                            </div>

                                        </div>


                                        {/* DESCRIPTION */}
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Description
                                            </label>

                                            <textarea
                                                value={
                                                    form.description
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    handleFormChange(
                                                        'description',
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                rows={
                                                    4
                                                }
                                                placeholder="Describe this station and its advertising offering..."
                                                className={`${inputClass} resize-none`}
                                            />
                                        </div>

                                    </div>
                                </section>


                                <div className="my-8 border-t border-slate-800" />


                                {/* LOCATION */}
                                <section>

                                    <div className="mb-4">
                                        <h3 className="text-sm font-semibold text-white">
                                            Location
                                        </h3>

                                        <p className="mt-1 text-xs text-slate-500">
                                            Where customers can find this advertising station.
                                        </p>
                                    </div>


                                    <div className="space-y-4">

                                        {/* ADDRESS */}
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Address
                                            </label>

                                            <input
                                                type="text"
                                                value={
                                                    form.location.address
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    handleLocationChange(
                                                        'address',
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                placeholder="Full street address"
                                                className={
                                                    inputClass
                                                }
                                            />
                                        </div>


                                        {/* CITY / STATE */}
                                        <div className="grid gap-4 sm:grid-cols-2">

                                            <div>
                                                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                    City
                                                </label>

                                                <input
                                                    type="text"
                                                    value={
                                                        form
                                                            .location
                                                            .city
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        handleLocationChange(
                                                            'city',
                                                            event
                                                                .target
                                                                .value
                                                        )
                                                    }
                                                    placeholder="Lagos"
                                                    className={
                                                        inputClass
                                                    }
                                                />
                                            </div>

                                            <div>
                                                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                    State
                                                </label>

                                                <input
                                                    type="text"
                                                    value={
                                                        form
                                                            .location
                                                            .state
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        handleLocationChange(
                                                            'state',
                                                            event
                                                                .target
                                                                .value
                                                        )
                                                    }
                                                    placeholder="Lagos"
                                                    className={
                                                        inputClass
                                                    }
                                                />
                                            </div>

                                        </div>


                                        {/* COUNTRY */}
                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Country
                                            </label>

                                            <input
                                                type="text"
                                                value={
                                                    form.location.country
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    handleLocationChange(
                                                        'country',
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                className={
                                                    inputClass
                                                }
                                            />
                                        </div>


                                        {/* COORDINATES */}
                                        <div>

                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Coordinates
                                                <span className="ml-2 font-normal text-slate-600">
                                                    Optional
                                                </span>
                                            </label>

                                            <div className="grid gap-4 sm:grid-cols-2">

                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={
                                                        form
                                                            .location
                                                            .coordinates
                                                            .latitude
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        handleCoordinateChange(
                                                            'latitude',
                                                            event
                                                                .target
                                                                .value
                                                        )
                                                    }
                                                    placeholder="Latitude"
                                                    className={
                                                        inputClass
                                                    }
                                                />

                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={
                                                        form
                                                            .location
                                                            .coordinates
                                                            .longitude
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        handleCoordinateChange(
                                                            'longitude',
                                                            event
                                                                .target
                                                                .value
                                                        )
                                                    }
                                                    placeholder="Longitude"
                                                    className={
                                                        inputClass
                                                    }
                                                />

                                            </div>

                                        </div>

                                    </div>
                                </section>


                                <div className="my-8 border-t border-slate-800" />


                                {/* CONTACT */}
                                <section>

                                    <div className="mb-4">
                                        <h3 className="text-sm font-semibold text-white">
                                            Contact Information
                                        </h3>

                                        <p className="mt-1 text-xs text-slate-500">
                                            Contact details customers may use to reach the station.
                                        </p>
                                    </div>


                                    <div className="space-y-4">

                                        <div className="grid gap-4 sm:grid-cols-2">

                                            <div>
                                                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                    Phone
                                                </label>

                                                <input
                                                    type="tel"
                                                    value={
                                                        form.phone
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        handleFormChange(
                                                            'phone',
                                                            event
                                                                .target
                                                                .value
                                                        )
                                                    }
                                                    placeholder="+234..."
                                                    className={
                                                        inputClass
                                                    }
                                                />
                                            </div>

                                            <div>
                                                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                    Email
                                                </label>

                                                <input
                                                    type="email"
                                                    value={
                                                        form.email
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        handleFormChange(
                                                            'email',
                                                            event
                                                                .target
                                                                .value
                                                        )
                                                    }
                                                    placeholder="contact@example.com"
                                                    className={
                                                        inputClass
                                                    }
                                                />
                                            </div>

                                        </div>


                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Website
                                            </label>

                                            <input
                                                type="url"
                                                value={
                                                    form.website
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    handleFormChange(
                                                        'website',
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                placeholder="https://example.com"
                                                className={
                                                    inputClass
                                                }
                                            />
                                        </div>

                                    </div>
                                </section>


                                <div className="my-8 border-t border-slate-800" />


                                {/* ADVERTISING */}
                                <section>

                                    <div className="mb-4">
                                        <h3 className="text-sm font-semibold text-white">
                                            Advertising
                                        </h3>

                                        <p className="mt-1 text-xs text-slate-500">
                                            Describe what customers can purchase from this station.
                                        </p>
                                    </div>


                                    <div className="space-y-4">

                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Advertising Formats
                                            </label>

                                            <input
                                                type="text"
                                                value={
                                                    form.advertisingFormats
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    handleFormChange(
                                                        'advertisingFormats',
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                placeholder="TV Commercial, Sponsorship, News Mention"
                                                className={
                                                    inputClass
                                                }
                                            />

                                            <p className="mt-1.5 text-[11px] text-slate-600">
                                                Separate multiple formats with commas.
                                            </p>
                                        </div>


                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Features
                                            </label>

                                            <input
                                                type="text"
                                                value={
                                                    form.features
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    handleFormChange(
                                                        'features',
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                placeholder="Prime Time, Nationwide Reach, HD"
                                                className={
                                                    inputClass
                                                }
                                            />

                                            <p className="mt-1.5 text-[11px] text-slate-600">
                                                Separate multiple features with commas.
                                            </p>
                                        </div>


                                        {/* SPECIFICATIONS */}
                                        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">

                                            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                Specifications
                                            </p>

                                            <div className="space-y-4">

                                                <div>
                                                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                        Size
                                                    </label>

                                                    <input
                                                        type="text"
                                                        value={
                                                            form
                                                                .specifications
                                                                .size
                                                        }
                                                        onChange={(
                                                            event
                                                        ) =>
                                                            handleSpecificationChange(
                                                                'size',
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                        placeholder="e.g. 48 inch"
                                                        className={
                                                            inputClass
                                                        }
                                                    />
                                                </div>

                                                <div className="grid gap-4 sm:grid-cols-2">

                                                    <div>
                                                        <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                            Resolution
                                                        </label>

                                                        <input
                                                            type="text"
                                                            value={
                                                                form
                                                                    .specifications
                                                                    .resolution
                                                            }
                                                            onChange={(
                                                                event
                                                            ) =>
                                                                handleSpecificationChange(
                                                                    'resolution',
                                                                    event
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder="e.g. 1920x1080"
                                                            className={
                                                                inputClass
                                                            }
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                            Audience
                                                        </label>

                                                        <input
                                                            type="text"
                                                            value={
                                                                form
                                                                    .specifications
                                                                    .audience
                                                            }
                                                            onChange={(
                                                                event
                                                            ) =>
                                                                handleSpecificationChange(
                                                                    'audience',
                                                                    event
                                                                        .target
                                                                        .value
                                                                )
                                                            }
                                                            placeholder="e.g. 2M monthly viewers"
                                                            className={
                                                                inputClass
                                                            }
                                                        />
                                                    </div>

                                                </div>

                                            </div>

                                        </div>

                                    </div>
                                </section>


                                <div className="my-8 border-t border-slate-800" />


                                {/* PRICING */}
                                <section>

                                    <div className="mb-4">
                                        <h3 className="text-sm font-semibold text-white">
                                            Pricing
                                        </h3>

                                        <p className="mt-1 text-xs text-slate-500">
                                            Set the current advertising price for this station.
                                        </p>
                                    </div>


                                    <div className="grid gap-4 sm:grid-cols-3">

                                        <div className="sm:col-span-1">
                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Amount
                                            </label>

                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={
                                                    form
                                                        .pricing
                                                        .amount
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    handlePricingChange(
                                                        'amount',
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                placeholder="0"
                                                className={
                                                    inputClass
                                                }
                                            />
                                        </div>


                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Currency
                                            </label>

                                            <input
                                                type="text"
                                                value={
                                                    form
                                                        .pricing
                                                        .currency
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    handlePricingChange(
                                                        'currency',
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                className={
                                                    inputClass
                                                }
                                            />
                                        </div>


                                        <div>
                                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                                Unit
                                            </label>

                                            <div className="relative">
                                                <select
                                                    value={
                                                        form
                                                            .pricing
                                                            .unit
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        handlePricingChange(
                                                            'unit',
                                                            event
                                                                .target
                                                                .value
                                                        )
                                                    }
                                                    className={`${selectClass} pr-10`}
                                                >
                                                    <option value="DAY">
                                                        Day
                                                    </option>

                                                    <option value="WEEK">
                                                        Week
                                                    </option>

                                                    <option value="MONTH">
                                                        Month
                                                    </option>

                                                    <option value="CAMPAIGN">
                                                        Campaign
                                                    </option>

                                                    <option value="SPOT">
                                                        Spot
                                                    </option>

                                                    <option value="IMPRESSION">
                                                        Impression
                                                    </option>

                                                    <option value="CUSTOM">
                                                        Custom
                                                    </option>
                                                </select>

                                                <ChevronDown
                                                    size={
                                                        16
                                                    }
                                                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                                                />
                                            </div>
                                        </div>

                                    </div>
                                </section>


                                <div className="my-8 border-t border-slate-800" />


                                {/* MARKETPLACE */}
                                <section>

                                    <div className="mb-4">
                                        <h3 className="text-sm font-semibold text-white">
                                            Marketplace
                                        </h3>

                                        <p className="mt-1 text-xs text-slate-500">
                                            Information displayed to customers when comparing stations.
                                        </p>
                                    </div>


                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-slate-400">
                                            Reach
                                        </label>

                                        <input
                                            type="text"
                                            value={
                                                form.reach
                                            }
                                            onChange={(
                                                event
                                            ) =>
                                                handleFormChange(
                                                    'reach',
                                                    event
                                                        .target
                                                        .value
                                                )
                                            }
                                            placeholder="e.g. 5M monthly audience"
                                            className={
                                                inputClass
                                            }
                                        />
                                    </div>

                                </section>


                                {/* INFO */}
                                <div className="mt-8 rounded-xl border border-emerald-500/10 bg-emerald-500/5 px-4 py-3">

                                    <p className="text-xs leading-5 text-slate-400">
                                        New stations are created as{' '}
                                        <span className="font-medium text-amber-400">
                                            Pending
                                        </span>{' '}
                                        approval and inactive. An admin must approve the station before it can become active.
                                    </p>

                                </div>

                            </div>


                            {/* FOOTER */}
                            <div className="shrink-0 border-t border-slate-800 bg-slate-950 px-5 py-4 sm:px-6">

                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">

                                    <button
                                        type="button"
                                        disabled={
                                            creating
                                        }
                                        onClick={() => {
                                            setShowCreateForm(
                                                false
                                            );

                                            resetCreateForm();
                                        }}
                                        className="rounded-xl border border-slate-800 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        type="submit"
                                        disabled={
                                            creating
                                        }
                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {creating ? (
                                            <>
                                                <RefreshCw
                                                    size={
                                                        16
                                                    }
                                                    className="animate-spin"
                                                />

                                                Creating...
                                            </>
                                        ) : (
                                            <>
                                                <Plus
                                                    size={
                                                        17
                                                    }
                                                />

                                                Create Station
                                            </>
                                        )}
                                    </button>

                                </div>

                            </div>

                        </form>

                    </div>
                </div>
            )}

        </div>
    );
}