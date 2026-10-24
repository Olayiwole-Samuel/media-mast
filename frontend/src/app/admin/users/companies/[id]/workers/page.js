'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Building2,
    CheckCircle2,
    ChevronRight,
    Clock3,
    Mail,
    MoreHorizontal,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    UserRound,
    Users,
    X,
    UserX,
} from 'lucide-react';

import {
    getAdminCompany,
    getAdminCompanyWorkers,
    activateAdminCompanyWorker,
    deactivateAdminCompanyWorker,
    reactivateAdminCompanyWorker,
    removeAdminCompanyWorker,
} from '@/lib/api';


// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const isValidObjectId = (value) => {
    return /^[a-fA-F0-9]{24}$/.test(String(value || ''));
};

const getResponseData = (response) => {
    if (!response) return null;

    return (
        response.data ||
        response.company ||
        response
    );
};

const getCompanyData = (response) => {
    const data = getResponseData(response);

    if (!data) return null;

    return {
        company:
            data.company ||
            data.data?.company ||
            null,

        companyUser:
            data.companyUser ||
            data.user ||
            data.data?.companyUser ||
            null,
    };
};

const getWorkersData = (response) => {
    const data = getResponseData(response);

    if (!data) {
        return {
            company: null,
            workers: [],
            total: 0,
            active: 0,
            inactive: 0,
        };
    }

    const total =
        data.total ??
        data.data?.total ??
        data.workerCount ??
        data.data?.workerCount ??
        0;

    const active =
        data.active ??
        data.data?.active ??
        data.activeWorkerCount ??
        data.data?.activeWorkerCount ??
        0;

    return {
        company:
            data.company ||
            data.data?.company ||
            null,

        workers:
            data.workers ||
            data.data?.workers ||
            [],

        total,

        active,

        inactive:
            data.inactive ??
            data.data?.inactive ??
            Math.max(
                0,
                Number(total) - Number(active)
            ),
    };
};

const getWorkerId = (worker) => {
    return worker?._id || worker?.id || '';
};

const getWorkerUser = (worker) => {
    return worker?.user || worker?.userId || {};
};

const getWorkerName = (worker) => {
    const user = getWorkerUser(worker);

    return (
        user?.name ||
        worker?.name ||
        'Unnamed Worker'
    );
};

const getWorkerEmail = (worker) => {
    const user = getWorkerUser(worker);

    return (
        user?.email ||
        worker?.email ||
        'No email'
    );
};

const getWorkerImage = (worker) => {
    const user = getWorkerUser(worker);

    return (
        user?.image ||
        user?.avatar ||
        worker?.image ||
        null
    );
};

const getWorkerStatus = (worker) => {
    const user = getWorkerUser(worker);

    if (
        worker?.isActive === true ||
        user?.status === 'ACTIVE'
    ) {
        return 'ACTIVE';
    }

    if (
        user?.status === 'DEACTIVATED' ||
        user?.status === 'SUSPENDED'
    ) {
        return user.status;
    }

    return worker?.isActive === false
        ? 'INACTIVE'
        : user?.status || 'UNKNOWN';
};

const getStatusStyles = (status) => {
    switch (String(status || '').toUpperCase()) {
        case 'ACTIVE':
            return {
                label: 'Active',
                className:
                    'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
                dot: 'bg-emerald-400',
            };

        case 'DEACTIVATED':
            return {
                label: 'Deactivated',
                className:
                    'border-red-400/20 bg-red-400/10 text-red-300',
                dot: 'bg-red-400',
            };

        case 'SUSPENDED':
            return {
                label: 'Suspended',
                className:
                    'border-orange-400/20 bg-orange-400/10 text-orange-300',
                dot: 'bg-orange-400',
            };

        case 'INACTIVE':
            return {
                label: 'Inactive',
                className:
                    'border-slate-400/20 bg-slate-400/10 text-slate-300',
                dot: 'bg-slate-400',
            };

        default:
            return {
                label: status || 'Unknown',
                className:
                    'border-white/10 bg-white/[0.04] text-slate-400',
                dot: 'bg-slate-500',
            };
    }
};

const formatDate = (value) => {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return new Intl.DateTimeFormat('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(date);
};

const getDepartmentName = (worker) => {
    const department = worker?.department;

    if (!department) {
        return 'No department';
    }

    if (typeof department === 'string') {
        return department;
    }

    return (
        department?.name ||
        department?.title ||
        'No department'
    );
};

const getPosition = (worker) => {
    return worker?.position || 'Team Member';
};

const isCompanyOwner = (worker) => {
    return String(
        worker?.position || ''
    ).trim().toLowerCase() === 'company owner';
};


// ─────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
    const styles = getStatusStyles(status);

    return (
        <span
            className={`
                inline-flex items-center gap-2
                rounded-full border
                px-2.5 py-1
                text-[11px] font-medium
                ${styles.className}
            `}
        >
            <span
                className={`
                    h-1.5 w-1.5 rounded-full
                    ${styles.dot}
                `}
            />

            {styles.label}
        </span>
    );
}


// ─────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────

function WorkerAvatar({ worker, size = 'normal' }) {
    const [imageError, setImageError] =
        useState(false);

    const image = getWorkerImage(worker);
    const name = getWorkerName(worker);

    const initials = name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join('')
        .toUpperCase();

    const sizeClass =
        size === 'small'
            ? 'h-9 w-9 rounded-xl text-xs'
            : 'h-11 w-11 rounded-xl text-sm';

    if (image && !imageError) {
        return (
            <div
                className={`
                    shrink-0 overflow-hidden
                    border border-white/[0.08]
                    bg-white/[0.04]
                    ${sizeClass}
                `}
            >
                <img
                    src={image}
                    alt={name}
                    className="h-full w-full object-cover"
                    onError={() =>
                        setImageError(true)
                    }
                />
            </div>
        );
    }

    return (
        <div
            className={`
                flex shrink-0 items-center
                justify-center
                border border-emerald-400/10
                bg-emerald-400/[0.07]
                font-semibold text-emerald-400
                ${sizeClass}
            `}
        >
            {initials || (
                <UserRound size={17} />
            )}
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────

function LoadingSkeleton() {
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">

                <div className="mb-8 flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-white/[0.05]" />

                    <div className="space-y-2">
                        <div className="h-5 w-40 animate-pulse rounded bg-white/[0.05]" />
                        <div className="h-3 w-56 animate-pulse rounded bg-white/[0.04]" />
                    </div>
                </div>

                <div className="mb-6 grid gap-4 sm:grid-cols-3">
                    {[1, 2, 3].map((item) => (
                        <div
                            key={item}
                            className="h-28 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]"
                        />
                    ))}
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
                    <div className="h-16 animate-pulse border-b border-white/[0.06] bg-white/[0.02]" />

                    <div className="space-y-1 p-3">
                        {[1, 2, 3, 4, 5].map((item) => (
                            <div
                                key={item}
                                className="h-20 animate-pulse rounded-xl bg-white/[0.025]"
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────

function EmptyState({
    search,
    statusFilter,
    onClear,
    onCreate,
}) {
    const filtered =
        search.trim() ||
        statusFilter !== 'ALL';

    return (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">

            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.035]">
                {filtered ? (
                    <Search
                        size={23}
                        className="text-slate-500"
                    />
                ) : (
                    <Users
                        size={23}
                        className="text-slate-500"
                    />
                )}
            </div>

            <h3 className="text-sm font-semibold text-white">
                {filtered
                    ? 'No workers found'
                    : 'No workers yet'}
            </h3>

            <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
                {filtered
                    ? 'Try changing your search or status filter.'
                    : 'Add the first worker to this company to get started.'}
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">

                {filtered && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                    >
                        Clear filters
                    </button>
                )}

                {!filtered && (
                    <button
                        type="button"
                        onClick={onCreate}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300"
                    >
                        <Plus size={15} />
                        Add Worker
                    </button>
                )}
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function CompanyWorkersPage() {
    const params = useParams();
    const router = useRouter();

    const companyId = useMemo(() => {
        return Array.isArray(params?.id)
            ? params.id[0]
            : params?.id;
    }, [params?.id]);

    const [company, setCompany] =
        useState(null);

    const [workers, setWorkers] =
        useState([]);

    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        inactive: 0,
    });

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState('');

    const [search, setSearch] =
        useState('');

    const [statusFilter, setStatusFilter] =
        useState('ALL');

    const [openMenu, setOpenMenu] =
        useState(null);

    const [actionLoading, setActionLoading] =
        useState(null);

    const [actionError, setActionError] =
        useState('');

    const [imageError, setImageError] =
        useState(false);


    // ─────────────────────────────────────────────────────────
    // Load data
    // ─────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        if (!companyId) return;

        if (!isValidObjectId(companyId)) {
            setError(
                `Invalid company ID: ${companyId}`
            );
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError('');

            const [
                companyResponse,
                workersResponse,
            ] = await Promise.all([
                getAdminCompany(companyId),
                getAdminCompanyWorkers(companyId),
            ]);

            const companyData =
                getCompanyData(
                    companyResponse
                );

            const workersData =
                getWorkersData(
                    workersResponse
                );

            setCompany(
                companyData?.company ||
                workersData.company ||
                null
            );

            setWorkers(
                Array.isArray(
                    workersData.workers
                )
                    ? workersData.workers
                    : []
            );

            setStats({
                total:
                    Number(
                        workersData.total
                    ) || 0,

                active:
                    Number(
                        workersData.active
                    ) || 0,

                inactive:
                    Number(
                        workersData.inactive
                    ) || 0,
            });

        } catch (err) {
            console.error(
                'Failed to load company workers:',
                err
            );

            setError(
                err?.message ||
                'Failed to load company workers.'
            );
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => {
        if (!companyId) return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, [companyId, loadData]);


    // ─────────────────────────────────────────────────────────
    // Filter workers
    // ─────────────────────────────────────────────────────────

    const filteredWorkers = useMemo(() => {
        const query =
            search
                .trim()
                .toLowerCase();

        return workers.filter((worker) => {

            const name =
                getWorkerName(worker)
                    .toLowerCase();

            const email =
                getWorkerEmail(worker)
                    .toLowerCase();

            const position =
                getPosition(worker)
                    .toLowerCase();

            const department =
                getDepartmentName(worker)
                    .toLowerCase();

            const status =
                getWorkerStatus(worker);

            const matchesSearch =
                !query ||
                name.includes(query) ||
                email.includes(query) ||
                position.includes(query) ||
                department.includes(query);

            const matchesStatus =
                statusFilter === 'ALL' ||
                (
                    statusFilter === 'ACTIVE' &&
                    status === 'ACTIVE'
                ) ||
                (
                    statusFilter === 'INACTIVE' &&
                    status !== 'ACTIVE'
                );

            return (
                matchesSearch &&
                matchesStatus
            );
        });

    }, [
        workers,
        search,
        statusFilter,
    ]);


    // ─────────────────────────────────────────────────────────
    // Clear filters
    // ─────────────────────────────────────────────────────────

    const clearFilters = () => {
        setSearch('');
        setStatusFilter('ALL');
    };


    // ─────────────────────────────────────────────────────────
    // Navigate
    // ─────────────────────────────────────────────────────────

const goToProfile = (workerId) => {
    if (!workerId) {
        console.error('Worker ID is missing');
        return;
    }

    router.push(
        `/admin/users/companies/${companyId}/workers/${workerId}`
    );
};

    const goToCreate = () => {
        router.push(
            `/admin/users/companies/${companyId}/workers/create`
        );
    };


    // ─────────────────────────────────────────────────────────
    // Worker actions
    // ─────────────────────────────────────────────────────────

    const runWorkerAction = async (
        worker,
        action
    ) => {
        const workerId =
            getWorkerId(worker);

        if (!workerId) {
            setActionError(
                'Worker ID is missing.'
            );
            return;
        }

        if (!isValidObjectId(workerId)) {
            setActionError(
                'Invalid worker ID.'
            );
            return;
        }

        try {
            setActionLoading(
                `${action}:${workerId}`
            );

            setActionError('');
            setOpenMenu(null);

            if (action === 'activate') {
                await activateAdminCompanyWorker(
                    companyId,
                    workerId
                );
            }

            if (action === 'deactivate') {
                await deactivateAdminCompanyWorker(
                    companyId,
                    workerId
                );
            }

            if (action === 'reactivate') {
                await reactivateAdminCompanyWorker(
                    companyId,
                    workerId
                );
            }

            if (action === 'remove') {
                const confirmed =
                    window.confirm(
                        `Remove ${getWorkerName(worker)} from this company?`
                    );

                if (!confirmed) {
                    setActionLoading(null);
                    return;
                }

                await removeAdminCompanyWorker(
                    companyId,
                    workerId
                );
            }

            /*
             * Always reload from backend.
             * No optimistic/fake state.
             */
            await loadData();

        } catch (err) {
            console.error(
                `Failed to ${action} worker:`,
                err
            );

            setActionError(
                err?.message ||
                `Failed to ${action} worker.`
            );

        } finally {
            setActionLoading(null);
        }
    };


    // ─────────────────────────────────────────────────────────
    // Invalid ID
    // ─────────────────────────────────────────────────────────

    if (
        !companyId ||
        (
            !isValidObjectId(companyId) &&
            !loading
        )
    ) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">

                <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.025] p-7 text-center">

                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10">
                        <X
                            size={24}
                            className="text-red-400"
                        />
                    </div>

                    <h1 className="text-lg font-semibold">
                        Invalid Company
                    </h1>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        {error ||
                            'A valid company ID is required.'}
                    </p>

                    <button
                        type="button"
                        onClick={() =>
                            router.push(
                                '/admin/users/companies'
                            )
                        }
                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                    >
                        <ArrowLeft size={16} />
                        Back to Companies
                    </button>
                </div>
            </div>
        );
    }


    // ─────────────────────────────────────────────────────────
    // Loading
    // ─────────────────────────────────────────────────────────

    if (loading) {
        return <LoadingSkeleton />;
    }


    // ─────────────────────────────────────────────────────────
    // Error
    // ─────────────────────────────────────────────────────────

    if (error && !company) {
        return (
            <div className="min-h-screen bg-slate-950 text-white">

                <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4">

                    <div className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.025] p-7 text-center">

                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10">
                            <X
                                size={24}
                                className="text-red-400"
                            />
                        </div>

                        <h1 className="text-lg font-semibold">
                            Unable to load workers
                        </h1>

                        <p className="mt-2 text-sm leading-6 text-slate-500">
                            {error}
                        </p>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">

                            <button
                                type="button"
                                onClick={loadData}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                            >
                                <RefreshCw size={16} />
                                Try Again
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        `/admin/users/companies/${companyId}`
                                    )
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                            >
                                <ArrowLeft size={16} />
                                Company Profile
                            </button>

                        </div>
                    </div>
                </div>
            </div>
        );
    }


    // ─────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────

    const companyInitial =
        company?.name
            ?.trim()
            ?.charAt(0)
            ?.toUpperCase() || 'C';

    return (
        <div className="min-h-screen bg-slate-950 text-white">

            <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">

                {/* Header */}
                <header className="mb-7">

                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

                        <div className="flex min-w-0 items-start gap-3">

                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        `/admin/users/companies/${companyId}`
                                    )
                                }
                                className="
                                    mt-0.5 flex h-10 w-10
                                    shrink-0 items-center
                                    justify-center rounded-xl
                                    border border-white/[0.08]
                                    bg-white/[0.025]
                                    text-slate-400
                                    transition
                                    hover:border-white/[0.14]
                                    hover:bg-white/[0.05]
                                    hover:text-white
                                "
                                aria-label="Back to company profile"
                            >
                                <ArrowLeft size={18} />
                            </button>

                            <div className="min-w-0">

                                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">

                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(
                                                '/admin/users/companies'
                                            )
                                        }
                                        className="transition hover:text-slate-300"
                                    >
                                        Companies
                                    </button>

                                    <ChevronRight size={13} />

                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(
                                                `/admin/users/companies/${companyId}`
                                            )
                                        }
                                        className="max-w-[180px] truncate transition hover:text-slate-300"
                                    >
                                        {company?.name ||
                                            'Company'}
                                    </button>

                                    <ChevronRight size={13} />

                                    <span className="text-slate-400">
                                        Workers
                                    </span>

                                </div>

                                <div className="flex items-center gap-3">

                                    <div className="hidden h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] sm:flex">

                                        {company?.logo &&
                                            !imageError ? (
                                            <img
                                                src={company.logo}
                                                alt={
                                                    company.name ||
                                                    'Company'
                                                }
                                                className="h-full w-full object-cover"
                                                onError={() =>
                                                    setImageError(
                                                        true
                                                    )
                                                }
                                            />
                                        ) : (
                                            <span className="text-sm font-semibold text-emerald-400">
                                                {companyInitial}
                                            </span>
                                        )}

                                    </div>

                                    <div className="min-w-0">

                                        <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
                                            Company Workers
                                        </h1>

                                        <p className="mt-1 truncate text-sm text-slate-500">
                                            {company?.name ||
                                                'Company'}{' '}
                                            · Manage team members
                                        </p>

                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={goToCreate}
                            className="
                                inline-flex items-center
                                justify-center gap-2
                                rounded-xl bg-emerald-400
                                px-4 py-2.5
                                text-sm font-semibold
                                text-slate-950
                                shadow-lg
                                shadow-emerald-500/10
                                transition
                                hover:bg-emerald-300
                            "
                        >
                            <Plus size={17} />
                            Add Worker
                        </button>

                    </div>
                </header>


                {/* Stats */}
                <div className="mb-6 grid gap-4 sm:grid-cols-3">

                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">

                        <div className="flex items-start justify-between">

                            <div>
                                <p className="text-xs font-medium text-slate-500">
                                    Total Workers
                                </p>

                                <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                                    {stats.total}
                                </p>
                            </div>

                            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
                                <Users
                                    size={17}
                                    className="text-slate-400"
                                />
                            </div>

                        </div>
                    </div>


                    <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.025] p-5">

                        <div className="flex items-start justify-between">

                            <div>
                                <p className="text-xs font-medium text-slate-500">
                                    Active
                                </p>

                                <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                                    {stats.active}
                                </p>
                            </div>

                            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/10 bg-emerald-400/[0.07]">
                                <CheckCircle2
                                    size={17}
                                    className="text-emerald-400"
                                />
                            </div>

                        </div>
                    </div>


                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">

                        <div className="flex items-start justify-between">

                            <div>
                                <p className="text-xs font-medium text-slate-500">
                                    Inactive
                                </p>

                                <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                                    {stats.inactive}
                                </p>
                            </div>

                            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
                                <UserX
                                    size={17}
                                    className="text-slate-400"
                                />
                            </div>

                        </div>
                    </div>

                </div>


                {/* Action Error */}
                {actionError && (
                    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-400/15 bg-red-400/[0.06] px-4 py-3.5">

                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-400/10">
                            <X
                                size={15}
                                className="text-red-400"
                            />
                        </div>

                        <div className="min-w-0">

                            <p className="text-sm font-medium text-red-300">
                                Action failed
                            </p>

                            <p className="mt-0.5 text-xs leading-5 text-red-300/70">
                                {actionError}
                            </p>

                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                setActionError('')
                            }
                            className="ml-auto shrink-0 p-1 text-red-400/60 transition hover:text-red-300"
                        >
                            <X size={16} />
                        </button>

                    </div>
                )}


                {/* Workers Card */}
                <section className="relative overflow-visible rounded-2xl border border-white/[0.07] bg-white/[0.025]">

                    {/* Toolbar */}
                    <div className="border-b border-white/[0.06] p-4 sm:p-5">

                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                            {/* Search */}
                            <div className="relative w-full lg:max-w-md">

                                <Search
                                    size={17}
                                    strokeWidth={1.8}
                                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                                />

                                <input
                                    type="search"
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(
                                            event.target.value
                                        )
                                    }
                                    placeholder="Search workers..."
                                    className="
                                        w-full rounded-xl
                                        border border-white/[0.08]
                                        bg-white/[0.035]
                                        py-2.5 pl-10 pr-4
                                        text-sm text-white
                                        outline-none
                                        placeholder:text-slate-600
                                        transition
                                        focus:border-emerald-400/30
                                        focus:bg-white/[0.05]
                                        focus:ring-2
                                        focus:ring-emerald-400/10
                                    "
                                />

                            </div>


                            {/* Filters + Refresh */}
                            <div className="flex items-center gap-2">

                                <div
                                    className="
                                        flex min-w-0 flex-1
                                        items-center gap-2
                                        overflow-x-auto
                                        [-ms-overflow-style:none]
                                        [scrollbar-width:none]
                                        [&::-webkit-scrollbar]:hidden
                                    "
                                >

                                    {[
                                        {
                                            value: 'ALL',
                                            label: 'All',
                                        },
                                        {
                                            value: 'ACTIVE',
                                            label: 'Active',
                                        },
                                        {
                                            value: 'INACTIVE',
                                            label: 'Inactive',
                                        },
                                    ].map((filter) => {

                                        const selected =
                                            statusFilter ===
                                            filter.value;

                                        return (
                                            <button
                                                key={
                                                    filter.value
                                                }
                                                type="button"
                                                onClick={() =>
                                                    setStatusFilter(
                                                        filter.value
                                                    )
                                                }
                                                className={`
                                                    shrink-0
                                                    rounded-xl
                                                    border
                                                    px-3.5 py-2
                                                    text-xs
                                                    font-medium
                                                    transition
                                                    ${selected
                                                        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                                                        : 'border-white/[0.07] bg-white/[0.025] text-slate-500 hover:bg-white/[0.05] hover:text-slate-300'
                                                    }
                                                `}
                                            >
                                                {filter.label}
                                            </button>
                                        );
                                    })}

                                </div>

                                <button
                                    type="button"
                                    onClick={loadData}
                                    disabled={loading}
                                    className="
                                        flex h-9 w-9
                                        shrink-0
                                        items-center
                                        justify-center
                                        rounded-xl
                                        border border-white/[0.08]
                                        bg-white/[0.025]
                                        text-slate-500
                                        transition
                                        hover:bg-white/[0.05]
                                        hover:text-white
                                        disabled:opacity-50
                                    "
                                    title="Refresh workers"
                                >
                                    <RefreshCw size={15} />
                                </button>

                            </div>
                        </div>


                        <div className="mt-4 flex items-center justify-between gap-3">

                            <p className="text-xs text-slate-600">
                                {filteredWorkers.length}{' '}
                                {filteredWorkers.length === 1
                                    ? 'worker'
                                    : 'workers'}{' '}
                                shown
                            </p>

                            {(search ||
                                statusFilter !== 'ALL') && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="text-xs font-medium text-emerald-400 transition hover:text-emerald-300"
                                >
                                    Clear filters
                                </button>
                            )}

                        </div>
                    </div>


                    {/* Empty */}
                    {filteredWorkers.length === 0 ? (
                        <EmptyState
                            search={search}
                            statusFilter={statusFilter}
                            onClear={clearFilters}
                            onCreate={goToCreate}
                        />
                    ) : (
                        <>

                            {/* Desktop Header */}
                            <div className="hidden border-b border-white/[0.05] px-5 py-3 md:grid md:grid-cols-[2.2fr_1.3fr_1.2fr_0.9fr_40px] md:items-center md:gap-4 lg:px-6">

                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                                    Worker
                                </span>

                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                                    Position
                                </span>

                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                                    Department
                                </span>

                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                                    Status
                                </span>

                                <span />

                            </div>


                            {/* Worker Rows */}
                            <div className="relative divide-y divide-white/[0.05]">

                                {filteredWorkers.map(
                                    (worker) => {

                                        const workerId =
                                            getWorkerId(
                                                worker
                                            );

                                        const name =
                                            getWorkerName(
                                                worker
                                            );

                                        const email =
                                            getWorkerEmail(
                                                worker
                                            );

                                        const position =
                                            getPosition(
                                                worker
                                            );

                                        const department =
                                            getDepartmentName(
                                                worker
                                            );

                                        const status =
                                            getWorkerStatus(
                                                worker
                                            );

                                        const owner =
                                            isCompanyOwner(
                                                worker
                                            );

                                        const busy =
                                            actionLoading?.endsWith(
                                                `:${workerId}`
                                            );

                                        return (
                                            <div
                                                key={
                                                    workerId ||
                                                    `${name}-${email}`
                                                }
                                                className="
                                                    group
                                                    px-4 py-4
                                                    transition
                                                    hover:bg-white/[0.018]
                                                    sm:px-5
                                                    lg:px-6
                                                "
                                            >

                                                {/* Desktop */}
                                                <div className="hidden md:grid md:grid-cols-[2.2fr_1.3fr_1.2fr_0.9fr_40px] md:items-center md:gap-4">

                                                    {/* Worker */}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            goToProfile(
                                                                workerId
                                                            )
                                                        }
                                                        className="flex min-w-0 items-center gap-3 text-left"
                                                    >

                                                        <WorkerAvatar
                                                            worker={
                                                                worker
                                                            }
                                                        />

                                                        <div className="min-w-0">

                                                            <div className="flex items-center gap-2">

                                                                <p className="truncate text-sm font-medium text-white transition group-hover:text-emerald-300">
                                                                    {name}
                                                                </p>

                                                                {owner && (
                                                                    <span className="shrink-0 rounded-md border border-emerald-400/15 bg-emerald-400/[0.06] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                                                                        Owner
                                                                    </span>
                                                                )}

                                                            </div>

                                                            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-600">

                                                                <Mail size={12} />

                                                                <span className="truncate">
                                                                    {email}
                                                                </span>

                                                            </div>

                                                        </div>
                                                    </button>


                                                    {/* Position */}
                                                    <div className="min-w-0">

                                                        <p className="truncate text-sm text-slate-300">
                                                            {position}
                                                        </p>

                                                    </div>


                                                    {/* Department */}
                                                    <div className="min-w-0">

                                                        <p className="truncate text-sm text-slate-400">
                                                            {department}
                                                        </p>

                                                    </div>


                                                    {/* Status */}
                                                    <div>
                                                        <StatusBadge
                                                            status={status}
                                                        />
                                                    </div>


                                                    {/* Menu */}
                                                    <div className="relative z-[100] flex justify-end overflow-visible">

                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setOpenMenu(
                                                                    openMenu === workerId
                                                                        ? null
                                                                        : workerId
                                                                )
                                                            }
                                                            disabled={busy}
                                                            className="
                                                                flex h-8 w-8
                                                                items-center justify-center
                                                                rounded-lg
                                                                text-slate-600
                                                                opacity-0
                                                                transition
                                                                hover:bg-white/[0.06]
                                                                hover:text-white
                                                                group-hover:opacity-100
                                                                disabled:opacity-40
                                                            "
                                                            aria-label={`Actions for ${name}`}
                                                        >
                                                            {busy ? (
                                                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
                                                            ) : (
                                                                <MoreHorizontal size={17} />
                                                            )}
                                                        </button>

                                                        {openMenu === workerId && (
                                                            <WorkerMenu
                                                                worker={worker}
                                                                status={status}
                                                                onView={() =>
                                                                    goToProfile(
                                                                        workerId
                                                                    )
                                                                }
                                                                onActivate={() =>
                                                                    runWorkerAction(
                                                                        worker,
                                                                        'activate'
                                                                    )
                                                                }
                                                                onDeactivate={() =>
                                                                    runWorkerAction(
                                                                        worker,
                                                                        'deactivate'
                                                                    )
                                                                }
                                                                onReactivate={() =>
                                                                    runWorkerAction(
                                                                        worker,
                                                                        'reactivate'
                                                                    )
                                                                }
                                                                onRemove={() =>
                                                                    runWorkerAction(
                                                                        worker,
                                                                        'remove'
                                                                    )
                                                                }
                                                                disabled={busy}
                                                            />
                                                        )}

                                                    </div>

                                                </div>


                                                {/* Mobile */}
                                                <div className="md:hidden">

                                                    <div className="flex items-start gap-3">

                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                goToProfile(
                                                                    workerId
                                                                )
                                                            }
                                                        >
                                                            <WorkerAvatar
                                                                worker={
                                                                    worker
                                                                }
                                                            />
                                                        </button>


                                                        <div className="min-w-0 flex-1">

                                                            <div className="flex items-start justify-between gap-2">

                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        goToProfile(
                                                                            workerId
                                                                        )
                                                                    }
                                                                    className="min-w-0 text-left"
                                                                >

                                                                    <div className="flex flex-wrap items-center gap-2">

                                                                        <p className="truncate text-sm font-medium text-white">
                                                                            {name}
                                                                        </p>

                                                                        {owner && (
                                                                            <span className="rounded-md border border-emerald-400/15 bg-emerald-400/[0.06] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                                                                                Owner
                                                                            </span>
                                                                        )}

                                                                    </div>

                                                                    <p className="mt-1 truncate text-xs text-slate-600">
                                                                        {email}
                                                                    </p>

                                                                </button>


                                                                <div className="relative z-[100] shrink-0">

                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setOpenMenu(
                                                                                openMenu === workerId
                                                                                    ? null
                                                                                    : workerId
                                                                            )
                                                                        }
                                                                        disabled={busy}
                                                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                                                                    >
                                                                        {busy ? (
                                                                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
                                                                        ) : (
                                                                            <MoreHorizontal size={17} />
                                                                        )}
                                                                    </button>

                                                                    {openMenu === workerId && (
                                                                        <WorkerMenu
                                                                            worker={worker}
                                                                            status={status}
                                                                            onView={() =>
                                                                                goToProfile(
                                                                                    workerId
                                                                                )
                                                                            }
                                                                            onActivate={() =>
                                                                                runWorkerAction(
                                                                                    worker,
                                                                                    'activate'
                                                                                )
                                                                            }
                                                                            onDeactivate={() =>
                                                                                runWorkerAction(
                                                                                    worker,
                                                                                    'deactivate'
                                                                                )
                                                                            }
                                                                            onReactivate={() =>
                                                                                runWorkerAction(
                                                                                    worker,
                                                                                    'reactivate'
                                                                                )
                                                                            }
                                                                            onRemove={() =>
                                                                                runWorkerAction(
                                                                                    worker,
                                                                                    'remove'
                                                                                )
                                                                            }
                                                                            disabled={busy}
                                                                        />
                                                                    )}

                                                                </div>

                                                            </div>


                                                            <div className="mt-4 flex flex-wrap items-center gap-2">

                                                                <StatusBadge
                                                                    status={status}
                                                                />

                                                                <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[11px] text-slate-500">
                                                                    {position}
                                                                </span>

                                                                <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[11px] text-slate-500">
                                                                    {department}
                                                                </span>

                                                            </div>

                                                        </div>

                                                    </div>
                                                </div>

                                            </div>
                                        );
                                    }
                                )}

                            </div>
                        </>
                    )}
                </section>


                {/* Footer */}
                <div className="mt-5 flex flex-col gap-2 text-[11px] text-slate-700 sm:flex-row sm:items-center sm:justify-between">

                    <div className="flex items-center gap-2">

                        <Building2 size={12} />

                        <span>
                            {company?.name || 'Company'}
                        </span>

                    </div>

                    <div className="flex items-center gap-2">

                        <Clock3 size={12} />

                        <span>
                            Company created{' '}
                            {formatDate(
                                company?.createdAt
                            )}
                        </span>

                    </div>

                </div>

            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
// Worker Menu
// ─────────────────────────────────────────────────────────────

function WorkerMenu({
    status,
    onView,
    onActivate,
    onDeactivate,
    onReactivate,
    onRemove,
    disabled,
}) {
    return (
        <div
            className="
                absolute
                right-0
                top-full
                z-[9999]
                mt-2
                w-48
                overflow-hidden
                rounded-xl
                border border-white/[0.08]
                bg-slate-900
                shadow-2xl
                shadow-black/40
            "
        >

            {/* View */}
            <button
                type="button"
                onClick={onView}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-xs font-medium text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
            >
                <UserRound
                    size={15}
                    className="text-slate-500"
                />

                View Worker
            </button>


            <div className="border-t border-white/[0.05]" />


            {/* Activate */}
            {status !== 'ACTIVE' && (
                <button
                    type="button"
                    onClick={onActivate}
                    disabled={disabled}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
                >
                    <CheckCircle2 size={15} />

                    Activate
                </button>
            )}


            {/* Deactivate */}
            {status === 'ACTIVE' && (
                <button
                    type="button"
                    onClick={onDeactivate}
                    disabled={disabled}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-xs font-medium text-orange-300 transition hover:bg-orange-400/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
                >
                    <ShieldCheck size={15} />

                    Deactivate
                </button>
            )}


            {/* Reactivate */}
            {(status === 'DEACTIVATED' ||
                status === 'SUSPENDED' ||
                status === 'INACTIVE') && (
                <button
                    type="button"
                    onClick={onReactivate}
                    disabled={disabled}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
                >
                    <RefreshCw size={15} />

                    Reactivate
                </button>
            )}


            <div className="border-t border-white/[0.05]" />


            {/* Remove */}
            <button
                type="button"
                onClick={onRemove}
                disabled={disabled}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-xs font-medium text-red-300 transition hover:bg-red-400/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
            >
                <UserX size={15} />

                Remove Worker
            </button>

        </div>
    );
}