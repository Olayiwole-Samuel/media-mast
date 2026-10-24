'use client';

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

import { useParams, useRouter } from 'next/navigation';
import OwnerRecordCheck from '@/components/admin/OwnerRecordCheck';

import {
    ArrowLeft,
    Building2,
    Check,
    ChevronRight,
    CircleAlert,
    Clock3,
    Globe,
    Mail,
    MapPin,
    MoreHorizontal,
    Pencil,
    Phone,
    RefreshCw,
    ShieldCheck,
    ShieldX,
    Users,
    UserCheck,
    UserX,
    X,
} from 'lucide-react';

import {
    AnimatePresence,
    motion,
} from 'framer-motion';

import {
    getAdminCompany,
    updateAdminCompanyVerification,
    suspendAdminCompany,
    reactivateAdminCompany,
} from '@/lib/api';


// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const isValidObjectId = (value) => {
    return /^[a-fA-F0-9]{24}$/.test(
        String(value || '').trim()
    );
};


const normalizeRouteId = (value) => {
    if (Array.isArray(value)) {
        value = value[0];
    }

    if (typeof value !== 'string') {
        return '';
    }

    try {
        return decodeURIComponent(value).trim();
    } catch {
        return value.trim();
    }
};


const getResponseData = (response) => {
    if (!response) {
        return null;
    }

    /*
     * Expected backend response:
     *
     * {
     *   success: true,
     *   data: {
     *      company,
     *      companyUser,
     *      workers,
     *      workerCount,
     *      activeWorkerCount
     *   }
     * }
     */

    if (response.data) {
        return response.data;
    }

    return response;
};


const getCompanyData = (response) => {
    const data = getResponseData(response);

    if (!data) {
        return null;
    }

    /*
     * Supports:
     *
     * response.data.company
     * response.company
     *
     * without inventing any values.
     */

    return {
        company:
            data.company ||
            null,

        companyUser:
            data.companyUser ||
            data.user ||
            null,

        workers:
            Array.isArray(data.workers)
                ? data.workers
                : [],

        workerCount:
            data.workerCount ??
            0,

        activeWorkerCount:
            data.activeWorkerCount ??
            0,
    };
};


const formatDate = (date) => {
    if (!date) {
        return 'Not available';
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return 'Not available';
    }

    return new Intl.DateTimeFormat('en-NG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(parsed);
};


const formatDateTime = (date) => {
    if (!date) {
        return 'Not available';
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return 'Not available';
    }

    return new Intl.DateTimeFormat('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(parsed);
};


const getInitials = (name = '') => {
    const words = String(name)
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!words.length) {
        return 'CO';
    }

    if (words.length === 1) {
        return words[0]
            .slice(0, 2)
            .toUpperCase();
    }

    return `${words[0][0]}${words[words.length - 1][0]}`
        .toUpperCase();
};


const normalizeStatus = (status) => {
    return String(status || 'PENDING')
        .trim()
        .toUpperCase();
};


// ─────────────────────────────────────────────────────────────
// Status configuration
// ─────────────────────────────────────────────────────────────

const statusConfig = {
    APPROVED: {
        label: 'Approved',
        dot: 'bg-emerald-400',
        text: 'text-emerald-300',
        border: 'border-emerald-400/20',
        background: 'bg-emerald-400/10',
        icon: ShieldCheck,
    },

    PENDING: {
        label: 'Pending',
        dot: 'bg-amber-400',
        text: 'text-amber-300',
        border: 'border-amber-400/20',
        background: 'bg-amber-400/10',
        icon: Clock3,
    },

    REJECTED: {
        label: 'Rejected',
        dot: 'bg-red-400',
        text: 'text-red-300',
        border: 'border-red-400/20',
        background: 'bg-red-400/10',
        icon: ShieldX,
    },

    SUSPENDED: {
        label: 'Suspended',
        dot: 'bg-orange-400',
        text: 'text-orange-300',
        border: 'border-orange-400/20',
        background: 'bg-orange-400/10',
        icon: ShieldX,
    },
};


const workerStatusConfig = {
    ACTIVE: {
        label: 'Active',
        dot: 'bg-emerald-400',
        text: 'text-emerald-300',
    },

    DEACTIVATED: {
        label: 'Inactive',
        dot: 'bg-zinc-500',
        text: 'text-zinc-400',
    },

    SUSPENDED: {
        label: 'Suspended',
        dot: 'bg-orange-400',
        text: 'text-orange-300',
    },

    PENDING: {
        label: 'Pending',
        dot: 'bg-amber-400',
        text: 'text-amber-300',
    },
};


const getStatusConfig = (status) => {
    return (
        statusConfig[normalizeStatus(status)] ||
        statusConfig.PENDING
    );
};


const getWorkerStatusConfig = (status) => {
    return (
        workerStatusConfig[
            normalizeStatus(status)
        ] ||
        workerStatusConfig.DEACTIVATED
    );
};


// ─────────────────────────────────────────────────────────────
// Reusable UI
// ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
    const config = getStatusConfig(status);
    const Icon = config.icon;

    return (
        <span
            className={`
                inline-flex
                items-center
                gap-2
                rounded-full
                border
                ${config.border}
                ${config.background}
                px-3
                py-1.5
                text-xs
                font-medium
                ${config.text}
            `}
        >
            <Icon size={13} />
            {config.label}
        </span>
    );
}


function WorkerStatus({ status }) {
    const config =
        getWorkerStatusConfig(status);

    return (
        <span
            className={`
                inline-flex
                items-center
                gap-2
                text-xs
                font-medium
                ${config.text}
            `}
        >
            <span
                className={`
                    h-1.5
                    w-1.5
                    rounded-full
                    ${config.dot}
                `}
            />

            {config.label}
        </span>
    );
}


function Skeleton({
    className = '',
}) {
    return (
        <div
            className={`
                animate-pulse
                rounded-xl
                bg-white/[0.05]
                ${className}
            `}
        />
    );
}


function SectionHeader({
    eyebrow,
    title,
    description,
    action,
}) {
    return (
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
                {eyebrow && (
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
                        {eyebrow}
                    </p>
                )}

                <h2 className="text-lg font-semibold tracking-tight text-white">
                    {title}
                </h2>

                {description && (
                    <p className="mt-1 text-sm leading-6 text-zinc-500">
                        {description}
                    </p>
                )}
            </div>

            {action}
        </div>
    );
}


function DetailItem({
    icon: Icon,
    label,
    value,
    href,
}) {
    const content = (
        <div className="group flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-zinc-500 transition-colors group-hover:text-zinc-300">
                <Icon
                    size={16}
                    strokeWidth={1.8}
                />
            </div>

            <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                    {label}
                </p>

                <p className="mt-1 truncate text-sm font-medium text-zinc-200">
                    {value || 'Not provided'}
                </p>
            </div>
        </div>
    );

    if (!href) {
        return content;
    }

    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="block"
        >
            {content}
        </a>
    );
}


function StatCard({
    icon: Icon,
    label,
    value,
    description,
}) {
    return (
        <motion.div
            initial={{
                opacity: 0,
                y: 8,
            }}
            animate={{
                opacity: 1,
                y: 0,
            }}
            className="
                rounded-[22px]
                border
                border-white/[0.07]
                bg-white/[0.025]
                p-5
                transition-colors
                hover:bg-white/[0.04]
            "
        >
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-medium text-zinc-500">
                        {label}
                    </p>

                    <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                        {value}
                    </p>

                    {description && (
                        <p className="mt-1 text-xs text-zinc-600">
                            {description}
                        </p>
                    )}
                </div>

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.035] text-emerald-400">
                    <Icon size={18} />
                </div>
            </div>
        </motion.div>
    );
}


// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function CompanyProfilePage() {
    const params = useParams();
    const router = useRouter();

    /*
     * IMPORTANT:
     *
     * Next.js can theoretically return route params
     * as strings or arrays depending on routing/context.
     *
     * We normalize it before doing anything with it.
     */
    const companyId = useMemo(() => {
        return normalizeRouteId(params?.id);
    }, [params?.id]);


    const [companyData, setCompanyData] =
        useState(null);

    const [loading, setLoading] =
        useState(true);

    const [refreshing, setRefreshing] =
        useState(false);

    const [error, setError] =
        useState('');

    const [actionLoading, setActionLoading] =
        useState(false);

    const [showActions, setShowActions] =
        useState(false);

    const [confirmAction, setConfirmAction] =
        useState(null);


    // ─────────────────────────────────────────────────────────
    // Load company
    // ─────────────────────────────────────────────────────────

    const loadCompany = useCallback(
        async ({
            silent = false,
        } = {}) => {
            /*
             * Do not make an API request until
             * the route parameter exists.
             */
            if (!companyId) {
                setError(
                    'No company ID was provided in the URL.'
                );

                setLoading(false);
                setRefreshing(false);

                return;
            }


            /*
             * MongoDB ObjectIds are 24 hexadecimal characters.
             *
             * This prevents:
             *
             * /companies/undefined
             * /companies/[id]
             * /companies/acme
             * /companies/123
             *
             * from reaching the backend.
             */
            if (!isValidObjectId(companyId)) {
                console.error(
                    'Invalid company ID received from route:',
                    companyId
                );

                setError(
                    `Invalid company ID: ${companyId}`
                );

                setLoading(false);
                setRefreshing(false);

                return;
            }


            try {
                if (silent) {
                    setRefreshing(true);
                } else {
                    setLoading(true);
                }

                setError('');


                const response =
                    await getAdminCompany(
                        companyId
                    );


                const parsed =
                    getCompanyData(response);


                if (!parsed?.company) {
                    throw new Error(
                        'The company information could not be found.'
                    );
                }


                /*
                 * Make sure the backend actually returned
                 * the same company we requested.
                 */
                if (
                    parsed.company._id &&
                    String(parsed.company._id) !==
                        String(companyId)
                ) {
                    console.error(
                        'Company ID mismatch:',
                        {
                            requested: companyId,
                            returned:
                                parsed.company._id,
                        }
                    );

                    throw new Error(
                        'The server returned a different company than requested.'
                    );
                }


                setCompanyData(parsed);

            } catch (err) {
                console.error(
                    'Failed to load company:',
                    err
                );

                setError(
                    err?.message ||
                    'Failed to load company information.'
                );

            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [companyId]
    );


    useEffect(() => {
        /*
         * Never call the API when there is no route ID.
         */
        if (!companyId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLoading(false);
            return;
        }

        loadCompany();
    }, [
        companyId,
        loadCompany,
    ]);


    // ─────────────────────────────────────────────────────────
    // Derived backend data
    // ─────────────────────────────────────────────────────────

    const company =
        companyData?.company || null;

    const companyUser =
        companyData?.companyUser || null;

    const workers =
        Array.isArray(
            companyData?.workers
        )
            ? companyData.workers
            : [];


    /*
     * Use backend workerCount when supplied.
     *
     * We intentionally do not invent a number.
     */
    const workerCount =
        companyData?.workerCount !==
            undefined &&
        companyData?.workerCount !== null
            ? Number(
                  companyData.workerCount
              ) || 0
            : workers.length;


    /*
     * Same rule for active workers.
     */
    const activeWorkerCount =
        companyData?.activeWorkerCount !==
            undefined &&
        companyData?.activeWorkerCount !== null
            ? Number(
                  companyData.activeWorkerCount
              ) || 0
            : workers.filter(
                  (worker) =>
                      normalizeStatus(
                          worker?.user?.status
                      ) === 'ACTIVE' ||
                      worker?.isActive === true
              ).length;


    const inactiveWorkerCount =
        Math.max(
            workerCount -
                activeWorkerCount,
            0
        );


    const activePercentage =
        useMemo(() => {
            if (!workerCount) {
                return 0;
            }

            return Math.round(
                (activeWorkerCount /
                    workerCount) *
                    100
            );
        }, [
            workerCount,
            activeWorkerCount,
        ]);


    // ─────────────────────────────────────────────────────────
    // Company actions
    // ─────────────────────────────────────────────────────────

    const handleVerification =
        async (status) => {
            if (
                !company?._id ||
                !isValidObjectId(
                    company._id
                )
            ) {
                setError(
                    'Unable to update verification because the company ID is invalid.'
                );

                return;
            }


            try {
                setActionLoading(true);
                setError(false);


                await updateAdminCompanyVerification(
                    company._id,
                    status
                );


                /*
                 * Reload from backend.
                 *
                 * We do not fake the new status locally.
                 */
                await loadCompany({
                    silent: true,
                });

            } catch (err) {
                console.error(
                    'Failed to update company verification:',
                    err
                );

                setError(
                    err?.message ||
                    'Failed to update company verification.'
                );

            } finally {
                setActionLoading(false);
            }
        };


    const handleSuspend = async () => {
        if (
            !company?._id ||
            !isValidObjectId(
                company._id
            )
        ) {
            setError(
                'Unable to suspend company because the company ID is invalid.'
            );

            return;
        }


        try {
            setActionLoading(true);
            setConfirmAction(null);
            setShowActions(false);


            await suspendAdminCompany(
                company._id
            );


            await loadCompany({
                silent: true,
            });

        } catch (err) {
            console.error(
                'Failed to suspend company:',
                err
            );

            setError(
                err?.message ||
                'Failed to suspend company.'
            );

        } finally {
            setActionLoading(false);
        }
    };


    const handleReactivate =
        async () => {
            if (
                !company?._id ||
                !isValidObjectId(
                    company._id
                )
            ) {
                setError(
                    'Unable to reactivate company because the company ID is invalid.'
                );

                return;
            }


            try {
                setActionLoading(true);
                setConfirmAction(null);
                setShowActions(false);


                await reactivateAdminCompany(
                    company._id
                );


                await loadCompany({
                    silent: true,
                });

            } catch (err) {
                console.error(
                    'Failed to reactivate company:',
                    err
                );

                setError(
                    err?.message ||
                    'Failed to reactivate company.'
                );

            } finally {
                setActionLoading(false);
            }
        };


    // ─────────────────────────────────────────────────────────
    // Loading
    // ─────────────────────────────────────────────────────────

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-950 text-white">
                <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">

                    <div className="mb-8 flex items-center justify-between">
                        <Skeleton className="h-9 w-32" />

                        <Skeleton className="h-9 w-28" />
                    </div>


                    <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-6 sm:p-8">
                        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">

                            <Skeleton className="h-20 w-20 shrink-0 rounded-[24px]" />

                            <div className="flex-1">
                                <Skeleton className="h-7 w-56 max-w-full" />

                                <Skeleton className="mt-3 h-4 w-72 max-w-full" />

                                <Skeleton className="mt-4 h-6 w-24" />
                            </div>

                        </div>
                    </div>


                    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Skeleton className="h-32 rounded-[22px]" />
                        <Skeleton className="h-32 rounded-[22px]" />
                        <Skeleton className="h-32 rounded-[22px]" />
                        <Skeleton className="h-32 rounded-[22px]" />
                    </div>


                    <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
                        <Skeleton className="h-96 rounded-[26px]" />
                        <Skeleton className="h-96 rounded-[26px]" />
                    </div>

                </div>
            </main>
        );
    }


    // ─────────────────────────────────────────────────────────
    // Error
    // ─────────────────────────────────────────────────────────

    if (error && !company) {
        return (
            <main className="min-h-screen bg-slate-950 text-white">

                <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-5">

                    <div className="w-full rounded-[28px] border border-red-400/10 bg-red-400/[0.035] p-7 text-center">

                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/15 bg-red-400/10 text-red-400">
                            <CircleAlert size={24} />
                        </div>


                        <h1 className="mt-5 text-xl font-semibold">
                            Unable to load company
                        </h1>


                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            {error}
                        </p>


                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">

                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        '/admin/users/companies'
                                    )
                                }
                                className="
                                    inline-flex
                                    items-center
                                    justify-center
                                    gap-2
                                    rounded-xl
                                    border
                                    border-white/[0.08]
                                    bg-white/[0.04]
                                    px-4
                                    py-2.5
                                    text-sm
                                    font-medium
                                    text-zinc-300
                                    transition
                                    hover:bg-white/[0.07]
                                    hover:text-white
                                "
                            >
                                <ArrowLeft size={16} />

                                Back to companies
                            </button>


                            <button
                                type="button"
                                onClick={() =>
                                    loadCompany()
                                }
                                disabled={
                                    !companyId ||
                                    !isValidObjectId(
                                        companyId
                                    )
                                }
                                className="
                                    inline-flex
                                    items-center
                                    justify-center
                                    gap-2
                                    rounded-xl
                                    bg-emerald-500
                                    px-4
                                    py-2.5
                                    text-sm
                                    font-semibold
                                    text-slate-950
                                    transition
                                    hover:bg-emerald-400
                                    disabled:cursor-not-allowed
                                    disabled:opacity-40
                                "
                            >
                                <RefreshCw size={16} />

                                Try again
                            </button>

                        </div>

                    </div>

                </div>

            </main>
        );
    }


    // ─────────────────────────────────────────────────────────
    // No company
    // ─────────────────────────────────────────────────────────

    if (!company) {
        return (
            <main className="min-h-screen bg-slate-950 text-white">

                <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-5">

                    <div className="w-full rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 text-center">

                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.035] text-zinc-500">
                            <Building2 size={24} />
                        </div>


                        <h1 className="mt-5 text-xl font-semibold">
                            Company not found
                        </h1>


                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            The requested company could not be found.
                        </p>


                        <button
                            type="button"
                            onClick={() =>
                                router.push(
                                    '/admin/users/companies'
                                )
                            }
                            className="
                                mt-6
                                inline-flex
                                items-center
                                gap-2
                                rounded-xl
                                bg-emerald-500
                                px-4
                                py-2.5
                                text-sm
                                font-semibold
                                text-slate-950
                                transition
                                hover:bg-emerald-400
                            "
                        >
                            <ArrowLeft size={16} />

                            Back to companies
                        </button>

                    </div>

                </div>

            </main>
        );
    }


    // ─────────────────────────────────────────────────────────
    // Main derived values
    // ─────────────────────────────────────────────────────────

    const normalizedCompanyStatus =
        normalizeStatus(
            company?.status
        );


    const isSuspended =
        normalizedCompanyStatus ===
        'SUSPENDED';


    const canReactivate =
        isSuspended;


    const companyName =
        company?.name ||
        'Unnamed company';


    const companyEmail =
        company?.email ||
        companyUser?.email ||
        'No email provided';


    const companyWebsite =
        company?.website ||
        '';


    const companyMongoId =
        company?._id ||
        companyId;


    // ─────────────────────────────────────────────────────────
    // Main UI
    // ─────────────────────────────────────────────────────────

    return (
        <main
            className="
                min-h-screen
                bg-slate-950
                text-white
                selection:bg-emerald-400/20
                selection:text-emerald-200
            "
        >

            <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">


                {/* ─────────────────────────────────────────────
                    Top navigation
                ───────────────────────────────────────────── */}

                <div className="mb-6 flex items-center justify-between gap-3">

                    <button
                        type="button"
                        onClick={() =>
                            router.push(
                                '/admin/users/companies'
                            )
                        }
                        className="
                            group
                            inline-flex
                            items-center
                            gap-2
                            rounded-xl
                            border
                            border-white/[0.07]
                            bg-white/[0.025]
                            px-3.5
                            py-2.5
                            text-sm
                            font-medium
                            text-zinc-400
                            transition
                            hover:border-white/[0.12]
                            hover:bg-white/[0.05]
                            hover:text-white
                        "
                    >
                        <ArrowLeft
                            size={16}
                            className="transition-transform group-hover:-translate-x-0.5"
                        />

                        Companies
                    </button>


                    <div className="relative flex items-center gap-2">

                        <button
                            type="button"
                            onClick={() =>
                                router.push(
                                    `/admin/users/companies/${companyMongoId}/edit`
                                )
                            }
                            className="
                                inline-flex
                                items-center
                                gap-2
                                rounded-xl
                                border
                                border-white/[0.08]
                                bg-white/[0.035]
                                px-3.5
                                py-2.5
                                text-sm
                                font-medium
                                text-zinc-300
                                transition
                                hover:border-white/[0.13]
                                hover:bg-white/[0.06]
                                hover:text-white
                            "
                        >
                            <Pencil size={15} />

                            <span className="hidden sm:inline">
                                Edit Company
                            </span>

                            <span className="sm:hidden">
                                Edit
                            </span>
                        </button>


                        <button
                            type="button"
                            onClick={() =>
                                loadCompany({
                                    silent: true,
                                })
                            }
                            disabled={
                                refreshing ||
                                actionLoading
                            }
                            className="
                                inline-flex
                                h-10
                                w-10
                                items-center
                                justify-center
                                rounded-xl
                                border
                                border-white/[0.08]
                                bg-white/[0.035]
                                text-zinc-400
                                transition
                                hover:bg-white/[0.06]
                                hover:text-white
                                disabled:cursor-not-allowed
                                disabled:opacity-50
                            "
                            aria-label="Refresh company"
                        >
                            <RefreshCw
                                size={16}
                                className={
                                    refreshing
                                        ? 'animate-spin'
                                        : ''
                                }
                            />
                        </button>


                        <button
                            type="button"
                            onClick={() =>
                                setShowActions(
                                    (current) =>
                                        !current
                                )
                            }
                            disabled={
                                actionLoading
                            }
                            className="
                                inline-flex
                                h-10
                                w-10
                                items-center
                                justify-center
                                rounded-xl
                                border
                                border-white/[0.08]
                                bg-white/[0.035]
                                text-zinc-400
                                transition
                                hover:bg-white/[0.06]
                                hover:text-white
                                disabled:opacity-50
                            "
                            aria-label="Company actions"
                        >
                            <MoreHorizontal size={18} />
                        </button>


                        <AnimatePresence>
                            {showActions && (
                                <motion.div
                                    initial={{
                                        opacity: 0,
                                        y: -6,
                                        scale: 0.98,
                                    }}
                                    animate={{
                                        opacity: 1,
                                        y: 0,
                                        scale: 1,
                                    }}
                                    exit={{
                                        opacity: 0,
                                        y: -6,
                                        scale: 0.98,
                                    }}
                                    className="
                                        absolute
                                        right-0
                                        top-12
                                        z-30
                                        w-56
                                        overflow-hidden
                                        rounded-2xl
                                        border
                                        border-white/[0.09]
                                        bg-slate-900/95
                                        p-1.5
                                        shadow-2xl
                                        shadow-black/40
                                        backdrop-blur-xl
                                    "
                                >

                                    {canReactivate ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowActions(
                                                    false
                                                );

                                                setConfirmAction(
                                                    'reactivate'
                                                );
                                            }}
                                            className="
                                                flex
                                                w-full
                                                items-center
                                                gap-3
                                                rounded-xl
                                                px-3
                                                py-2.5
                                                text-left
                                                text-sm
                                                text-zinc-300
                                                transition
                                                hover:bg-emerald-400/10
                                                hover:text-emerald-300
                                            "
                                        >
                                            <UserCheck size={16} />

                                            Reactivate company
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowActions(
                                                    false
                                                );

                                                setConfirmAction(
                                                    'suspend'
                                                );
                                            }}
                                            disabled={
                                                actionLoading ||
                                                normalizedCompanyStatus ===
                                                    'REJECTED'
                                            }
                                            className="
                                                flex
                                                w-full
                                                items-center
                                                gap-3
                                                rounded-xl
                                                px-3
                                                py-2.5
                                                text-left
                                                text-sm
                                                text-zinc-300
                                                transition
                                                hover:bg-red-400/10
                                                hover:text-red-300
                                                disabled:cursor-not-allowed
                                                disabled:opacity-40
                                            "
                                        >
                                            <UserX size={16} />

                                            Suspend company
                                        </button>
                                    )}


                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowActions(
                                                false
                                            );

                                            router.push(
                                                `/admin/users/companies/${companyMongoId}/workers`
                                            );
                                        }}
                                        className="
                                            flex
                                            w-full
                                            items-center
                                            gap-3
                                            rounded-xl
                                            px-3
                                            py-2.5
                                            text-left
                                            text-sm
                                            text-zinc-300
                                            transition
                                            hover:bg-white/[0.05]
                                            hover:text-white
                                        "
                                    >
                                        <Users size={16} />

                                        Manage workers
                                    </button>

                                </motion.div>
                            )}
                        </AnimatePresence>

                    </div>

                </div>


                {/* ─────────────────────────────────────────────
                    Inline error
                ───────────────────────────────────────────── */}

                <AnimatePresence>
                    {error && company && (
                        <motion.div
                            initial={{
                                opacity: 0,
                                height: 0,
                                marginBottom: 0,
                            }}
                            animate={{
                                opacity: 1,
                                height: 'auto',
                                marginBottom: 20,
                            }}
                            exit={{
                                opacity: 0,
                                height: 0,
                                marginBottom: 0,
                            }}
                            className="
                                overflow-hidden
                                rounded-2xl
                                border
                                border-red-400/10
                                bg-red-400/[0.035]
                            "
                        >
                            <div className="flex items-start gap-3 p-4">

                                <CircleAlert
                                    size={17}
                                    className="mt-0.5 shrink-0 text-red-400"
                                />

                                <p className="flex-1 text-sm leading-6 text-red-300">
                                    {error}
                                </p>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setError('')
                                    }
                                    className="text-red-400/60 transition hover:text-red-300"
                                    aria-label="Dismiss error"
                                >
                                    <X size={16} />
                                </button>

                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>


                {/* ─────────────────────────────────────────────
                    Hero
                ───────────────────────────────────────────── */}

                <motion.section
                    initial={{
                        opacity: 0,
                        y: 10,
                    }}
                    animate={{
                        opacity: 1,
                        y: 0,
                    }}
                    className="
                        relative
                        overflow-hidden
                        rounded-[28px]
                        border
                        border-white/[0.07]
                        bg-white/[0.025]
                    "
                >

                    <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/[0.06] blur-3xl" />


                    <div className="relative p-6 sm:p-8 lg:p-9">

                        <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">

                            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">

                                {/* Logo */}

                                <div className="
                                    flex
                                    h-20
                                    w-20
                                    shrink-0
                                    items-center
                                    justify-center
                                    overflow-hidden
                                    rounded-[24px]
                                    border
                                    border-white/[0.08]
                                    bg-white/[0.05]
                                    text-xl
                                    font-semibold
                                    text-emerald-300
                                ">
                                    {company?.logo ? (
                                        <img
                                            src={company.logo}
                                            alt={`${companyName} logo`}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        getInitials(
                                            companyName
                                        )
                                    )}
                                </div>


                                {/* Identity */}

                                <div className="min-w-0">

                                    <div className="flex flex-wrap items-center gap-3">

                                        <h1 className="
                                            truncate
                                            text-2xl
                                            font-semibold
                                            tracking-[-0.03em]
                                            text-white
                                            sm:text-3xl
                                        ">
                                            {companyName}
                                        </h1>


                                        <StatusBadge
                                            status={
                                                company?.status
                                            }
                                        />

                                    </div>


                                    <p className="mt-2 truncate text-sm text-zinc-500">
                                        {company?.slug
                                            ? `@${company.slug}`
                                            : companyEmail}
                                    </p>


                                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-600">

                                        <span className="inline-flex items-center gap-1.5">
                                            <Mail size={13} />

                                            {companyEmail}
                                        </span>


                                        <span className="inline-flex items-center gap-1.5">
                                            <Clock3 size={13} />

                                            Joined{' '}

                                            {formatDate(
                                                company?.createdAt
                                            )}
                                        </span>

                                    </div>

                                </div>

                            </div>


                            {/* Hero action */}

                            <div className="shrink-0">

                                {isSuspended ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setConfirmAction(
                                                'reactivate'
                                            )
                                        }
                                        disabled={
                                            actionLoading
                                        }
                                        className="
                                            inline-flex
                                            w-full
                                            items-center
                                            justify-center
                                            gap-2
                                            rounded-xl
                                            bg-emerald-500
                                            px-4
                                            py-3
                                            text-sm
                                            font-semibold
                                            text-slate-950
                                            transition
                                            hover:bg-emerald-400
                                            disabled:opacity-50
                                            sm:w-auto
                                        "
                                    >
                                        <RefreshCw size={16} />

                                        Reactivate Company
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setConfirmAction(
                                                'suspend'
                                            )
                                        }
                                        disabled={
                                            actionLoading ||
                                            normalizedCompanyStatus ===
                                                'REJECTED'
                                        }
                                        className="
                                            inline-flex
                                            w-full
                                            items-center
                                            justify-center
                                            gap-2
                                            rounded-xl
                                            border
                                            border-white/[0.08]
                                            bg-white/[0.035]
                                            px-4
                                            py-3
                                            text-sm
                                            font-medium
                                            text-zinc-300
                                            transition
                                            hover:border-red-400/20
                                            hover:bg-red-400/10
                                            hover:text-red-300
                                            disabled:cursor-not-allowed
                                            disabled:opacity-40
                                            sm:w-auto
                                        "
                                    >
                                        <ShieldX size={16} />

                                        Suspend Company
                                    </button>
                                )}

                            </div>

                        </div>

                    </div>

                </motion.section>


                {/* ─────────────────────────────────────────────
                    Stats
                ───────────────────────────────────────────── */}

                <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

                    <StatCard
                        icon={Users}
                        label="Total workers"
                        value={workerCount}
                        description="Company team members"
                    />


                    <StatCard
                        icon={UserCheck}
                        label="Active workers"
                        value={activeWorkerCount}
                        description={
                            workerCount
                                ? `${activePercentage}% of team active`
                                : 'No workers yet'
                        }
                    />


                    <StatCard
                        icon={UserX}
                        label="Inactive workers"
                        value={
                            inactiveWorkerCount
                        }
                        description="Currently inactive"
                    />


                    <StatCard
                        icon={ShieldCheck}
                        label="Account status"
                        value={
                            getStatusConfig(
                                company?.status
                            ).label
                        }
                        description="Current company state"
                    />

                </section>


                {/* Owner record: shown only when it needs attention */}
                <OwnerRecordCheck companyId={companyId} />


                {/* ─────────────────────────────────────────────
                    Main content
                ───────────────────────────────────────────── */}

                <div className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">


                    {/* Company information */}

                    <motion.section
                        initial={{
                            opacity: 0,
                            y: 10,
                        }}
                        animate={{
                            opacity: 1,
                            y: 0,
                        }}
                        transition={{
                            delay: 0.05,
                        }}
                        className="
                            rounded-[26px]
                            border
                            border-white/[0.07]
                            bg-white/[0.025]
                            p-6
                            sm:p-7
                        "
                    >

                        <SectionHeader
                            eyebrow="Company"
                            title="Company information"
                            description="Business details currently stored in the system."
                            action={
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.push(
                                            `/admin/users/companies/${companyMongoId}/edit`
                                        )
                                    }
                                    className="
                                        inline-flex
                                        items-center
                                        gap-1.5
                                        text-xs
                                        font-medium
                                        text-emerald-400
                                        transition
                                        hover:text-emerald-300
                                    "
                                >
                                    Edit

                                    <ChevronRight size={14} />
                                </button>
                            }
                        />


                        <div className="grid gap-6 sm:grid-cols-2">

                            <DetailItem
                                icon={Building2}
                                label="Business name"
                                value={
                                    company?.name
                                }
                            />


                            <DetailItem
                                icon={Mail}
                                label="Email"
                                value={
                                    company?.email
                                }
                                href={
                                    company?.email
                                        ? `mailto:${company.email}`
                                        : undefined
                                }
                            />


                            <DetailItem
                                icon={Phone}
                                label="Phone"
                                value={
                                    company?.phone
                                }
                                href={
                                    company?.phone
                                        ? `tel:${company.phone}`
                                        : undefined
                                }
                            />


                            <DetailItem
                                icon={Globe}
                                label="Website"
                                value={
                                    companyWebsite ||
                                    'Not provided'
                                }
                                href={
                                    companyWebsite
                                        ? companyWebsite.startsWith(
                                              'http://'
                                          ) ||
                                          companyWebsite.startsWith(
                                              'https://'
                                          )
                                            ? companyWebsite
                                            : `https://${companyWebsite}`
                                        : undefined
                                }
                            />


                            <DetailItem
                                icon={MapPin}
                                label="Address"
                                value={
                                    company?.address
                                }
                            />


                            <DetailItem
                                icon={MapPin}
                                label="City"
                                value={
                                    company?.city
                                }
                            />


                            <DetailItem
                                icon={MapPin}
                                label="State"
                                value={
                                    company?.state
                                }
                            />


                            <DetailItem
                                icon={Globe}
                                label="Country"
                                value={
                                    company?.country
                                }
                            />

                        </div>


                        {company?.description && (
                            <div className="mt-7 border-t border-white/[0.06] pt-6">

                                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                                    Description
                                </p>


                                <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-zinc-400">
                                    {
                                        company.description
                                    }
                                </p>

                            </div>
                        )}

                    </motion.section>


                    {/* Account */}

                    <motion.section
                        initial={{
                            opacity: 0,
                            y: 10,
                        }}
                        animate={{
                            opacity: 1,
                            y: 0,
                        }}
                        transition={{
                            delay: 0.1,
                        }}
                        className="
                            rounded-[26px]
                            border
                            border-white/[0.07]
                            bg-white/[0.025]
                            p-6
                            sm:p-7
                        "
                    >

                        <SectionHeader
                            eyebrow="Account"
                            title="Company account"
                            description="Authentication and account information."
                        />


                        <div className="space-y-5">

                            <DetailItem
                                icon={Mail}
                                label="Login email"
                                value={
                                    companyUser?.email ||
                                    company?.email
                                }
                                href={
                                    companyUser?.email ||
                                    company?.email
                                        ? `mailto:${
                                              companyUser?.email ||
                                              company?.email
                                          }`
                                        : undefined
                                }
                            />


                            <DetailItem
                                icon={ShieldCheck}
                                label="Account status"
                                value={
                                    companyUser?.status ||
                                    'Not available'
                                }
                            />


                            <DetailItem
                                icon={Clock3}
                                label="Last login"
                                value={
                                    companyUser?.lastLogin
                                        ? formatDateTime(
                                              companyUser.lastLogin
                                          )
                                        : 'No login recorded'
                                }
                            />


                            <DetailItem
                                icon={Users}
                                label="Account type"
                                value={
                                    companyUser?.accountType ||
                                    'COMPANY'
                                }
                            />

                        </div>


                        <div className="mt-7 border-t border-white/[0.06] pt-6">

                            <div className="flex items-center justify-between gap-4">

                                <div>
                                    <p className="text-sm font-medium text-zinc-200">
                                        Company created
                                    </p>

                                    <p className="mt-1 text-xs text-zinc-600">
                                        {formatDateTime(
                                            company?.createdAt
                                        )}
                                    </p>
                                </div>


                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.035] text-zinc-500">
                                    <Building2 size={17} />
                                </div>

                            </div>


                            {company?.updatedAt && (
                                <div className="mt-5 flex items-center justify-between gap-4">

                                    <div>
                                        <p className="text-sm font-medium text-zinc-200">
                                            Last updated
                                        </p>

                                        <p className="mt-1 text-xs text-zinc-600">
                                            {formatDateTime(
                                                company.updatedAt
                                            )}
                                        </p>
                                    </div>


                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.035] text-zinc-500">
                                        <RefreshCw size={17} />
                                    </div>

                                </div>
                            )}

                        </div>

                    </motion.section>

                </div>


                {/* ─────────────────────────────────────────────
                    Verification
                ───────────────────────────────────────────── */}

                <motion.section
                    initial={{
                        opacity: 0,
                        y: 10,
                    }}
                    animate={{
                        opacity: 1,
                        y: 0,
                    }}
                    transition={{
                        delay: 0.15,
                    }}
                    className="
                        mt-6
                        rounded-[26px]
                        border
                        border-white/[0.07]
                        bg-white/[0.025]
                        p-6
                        sm:p-7
                    "
                >

                    <SectionHeader
                        eyebrow="Verification"
                        title="Company verification"
                        description="Manage the company's verification state."
                    />


                    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">

                        <div className="flex items-center gap-4">

                            <div className="
                                flex
                                h-12
                                w-12
                                shrink-0
                                items-center
                                justify-center
                                rounded-2xl
                                border
                                border-white/[0.07]
                                bg-white/[0.035]
                                text-emerald-400
                            ">
                                <ShieldCheck size={21} />
                            </div>


                            <div>

                                <p className="text-sm font-medium text-zinc-200">
                                    Current verification
                                </p>

                                <div className="mt-1.5">
                                    <StatusBadge
                                        status={
                                            company?.status
                                        }
                                    />
                                </div>

                            </div>

                        </div>


                        {normalizedCompanyStatus ===
                        'SUSPENDED' ? (
                            <div className="
                                rounded-xl
                                border
                                border-orange-400/10
                                bg-orange-400/[0.04]
                                px-4
                                py-3
                                text-sm
                                text-orange-300
                            ">
                                Verification is unavailable while the company is suspended.
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">

                                <button
                                    type="button"
                                    onClick={() =>
                                        handleVerification(
                                            'APPROVED'
                                        )
                                    }
                                    disabled={
                                        actionLoading ||
                                        normalizedCompanyStatus ===
                                            'APPROVED'
                                    }
                                    className="
                                        inline-flex
                                        items-center
                                        gap-2
                                        rounded-xl
                                        border
                                        border-emerald-400/15
                                        bg-emerald-400/10
                                        px-4
                                        py-2.5
                                        text-xs
                                        font-semibold
                                        text-emerald-300
                                        transition
                                        hover:bg-emerald-400/15
                                        disabled:cursor-not-allowed
                                        disabled:opacity-40
                                    "
                                >
                                    <Check size={15} />

                                    Approve
                                </button>


                                <button
                                    type="button"
                                    onClick={() =>
                                        handleVerification(
                                            'PENDING'
                                        )
                                    }
                                    disabled={
                                        actionLoading ||
                                        normalizedCompanyStatus ===
                                            'PENDING'
                                    }
                                    className="
                                        inline-flex
                                        items-center
                                        gap-2
                                        rounded-xl
                                        border
                                        border-amber-400/15
                                        bg-amber-400/10
                                        px-4
                                        py-2.5
                                        text-xs
                                        font-semibold
                                        text-amber-300
                                        transition
                                        hover:bg-amber-400/15
                                        disabled:cursor-not-allowed
                                        disabled:opacity-40
                                    "
                                >
                                    <Clock3 size={15} />

                                    Pending
                                </button>


                                <button
                                    type="button"
                                    onClick={() =>
                                        handleVerification(
                                            'REJECTED'
                                        )
                                    }
                                    disabled={
                                        actionLoading ||
                                        normalizedCompanyStatus ===
                                            'REJECTED'
                                    }
                                    className="
                                        inline-flex
                                        items-center
                                        gap-2
                                        rounded-xl
                                        border
                                        border-red-400/15
                                        bg-red-400/10
                                        px-4
                                        py-2.5
                                        text-xs
                                        font-semibold
                                        text-red-300
                                        transition
                                        hover:bg-red-400/15
                                        disabled:cursor-not-allowed
                                        disabled:opacity-40
                                    "
                                >
                                    <ShieldX size={15} />

                                    Reject
                                </button>

                            </div>
                        )}

                    </div>

                </motion.section>


                {/* ─────────────────────────────────────────────
                    Workers
                ───────────────────────────────────────────── */}

                <motion.section
                    initial={{
                        opacity: 0,
                        y: 10,
                    }}
                    animate={{
                        opacity: 1,
                        y: 0,
                    }}
                    transition={{
                        delay: 0.2,
                    }}
                    className="
                        mt-6
                        overflow-hidden
                        rounded-[26px]
                        border
                        border-white/[0.07]
                        bg-white/[0.025]
                    "
                >

                    <div className="p-6 pb-4 sm:p-7 sm:pb-5">

                        <SectionHeader
                            eyebrow="Team"
                            title="Company workers"
                            description={`${workerCount} ${
                                workerCount === 1
                                    ? 'worker'
                                    : 'workers'
                            } currently associated with this company.`}
                            action={
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.push(
                                            `/admin/users/companies/${companyMongoId}/workers`
                                        )
                                    }
                                    className="
                                        inline-flex
                                        items-center
                                        gap-1.5
                                        text-xs
                                        font-medium
                                        text-emerald-400
                                        transition
                                        hover:text-emerald-300
                                    "
                                >
                                    View all

                                    <ChevronRight size={14} />
                                </button>
                            }
                        />

                    </div>


                    {workers.length === 0 ? (
                        <div className="border-t border-white/[0.06] px-6 py-14 text-center sm:px-7">

                            <div className="
                                mx-auto
                                flex
                                h-12
                                w-12
                                items-center
                                justify-center
                                rounded-2xl
                                border
                                border-white/[0.07]
                                bg-white/[0.035]
                                text-zinc-600
                            ">
                                <Users size={20} />
                            </div>


                            <h3 className="mt-4 text-sm font-medium text-zinc-300">
                                No workers yet
                            </h3>


                            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-zinc-600">
                                This company does not have any workers associated with it yet.
                            </p>


                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        `/admin/users/companies/${companyMongoId}/workers/create`
                                    )
                                }
                                className="
                                    mt-5
                                    inline-flex
                                    items-center
                                    gap-2
                                    rounded-xl
                                    bg-white/[0.06]
                                    px-4
                                    py-2.5
                                    text-xs
                                    font-semibold
                                    text-zinc-300
                                    transition
                                    hover:bg-white/[0.09]
                                    hover:text-white
                                "
                            >
                                Add worker

                                <ChevronRight size={14} />
                            </button>

                        </div>
                    ) : (
                        <div className="border-t border-white/[0.06]">


                            {/* Desktop */}

                            <div className="hidden md:block">

                                <div className="
                                    grid
                                    grid-cols-[2fr_1.2fr_1.2fr_1fr_24px]
                                    items-center
                                    gap-4
                                    border-b
                                    border-white/[0.05]
                                    px-6
                                    py-3
                                    text-[10px]
                                    font-semibold
                                    uppercase
                                    tracking-[0.14em]
                                    text-zinc-600
                                    sm:px-7
                                ">
                                    <span>Worker</span>

                                    <span>Position</span>

                                    <span>Department</span>

                                    <span>Status</span>

                                    <span />
                                </div>


                                {workers
                                    .slice(0, 8)
                                    .map(
                                        (
                                            worker,
                                            index
                                        ) => {
                                            const workerUser =
                                                worker?.user ||
                                                {};


                                            const workerId =
                                                worker?._id ||
                                                workerUser?._id;


                                            const workerStatus =
                                                workerUser?.status ||
                                                (
                                                    worker?.isActive
                                                        ? 'ACTIVE'
                                                        : 'DEACTIVATED'
                                                );


                                            const workerName =
                                                workerUser?.name ||
                                                'Unnamed worker';


                                            const workerEmail =
                                                workerUser?.email ||
                                                'No email';


                                            const workerPosition =
                                                worker?.position ||
                                                'Team Member';


                                            const department =
                                                worker?.department?.name ||
                                                'No department';


                                            return (
                                                <motion.button
                                                    type="button"
                                                    key={
                                                        workerId ||
                                                        index
                                                    }
                                                    initial={{
                                                        opacity: 0,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                    }}
                                                    transition={{
                                                        delay:
                                                            0.03 *
                                                            index,
                                                    }}
                                                    onClick={() => {
                                                        if (
                                                            !workerId ||
                                                            !isValidObjectId(
                                                                workerId
                                                            )
                                                        ) {
                                                            setError(
                                                                'This worker does not have a valid ID.'
                                                            );

                                                            return;
                                                        }

                                                        router.push(
                                                            `/admin/users/companies/${companyMongoId}/workers/${workerId}`
                                                        );
                                                    }}
                                                    className="
                                                        group
                                                        grid
                                                        w-full
                                                        grid-cols-[2fr_1.2fr_1.2fr_1fr_24px]
                                                        items-center
                                                        gap-4
                                                        border-b
                                                        border-white/[0.04]
                                                        px-6
                                                        py-4
                                                        text-left
                                                        transition
                                                        last:border-b-0
                                                        hover:bg-white/[0.025]
                                                        sm:px-7
                                                    "
                                                >

                                                    <div className="flex min-w-0 items-center gap-3">

                                                        <div className="
                                                            flex
                                                            h-10
                                                            w-10
                                                            shrink-0
                                                            items-center
                                                            justify-center
                                                            overflow-hidden
                                                            rounded-xl
                                                            border
                                                            border-white/[0.07]
                                                            bg-white/[0.04]
                                                            text-xs
                                                            font-semibold
                                                            text-zinc-300
                                                        ">
                                                            {workerUser?.image ? (
                                                                <img
                                                                    src={
                                                                        workerUser.image
                                                                    }
                                                                    alt=""
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            ) : (
                                                                getInitials(
                                                                    workerName
                                                                )
                                                            )}
                                                        </div>


                                                        <div className="min-w-0">

                                                            <p className="truncate text-sm font-medium text-zinc-200 group-hover:text-white">
                                                                {
                                                                    workerName
                                                                }
                                                            </p>


                                                            <p className="mt-0.5 truncate text-xs text-zinc-600">
                                                                {
                                                                    workerEmail
                                                                }
                                                            </p>

                                                        </div>

                                                    </div>


                                                    <span className="truncate text-sm text-zinc-400">
                                                        {
                                                            workerPosition
                                                        }
                                                    </span>


                                                    <span className="truncate text-sm text-zinc-500">
                                                        {
                                                            department
                                                        }
                                                    </span>


                                                    <WorkerStatus
                                                        status={
                                                            workerStatus
                                                        }
                                                    />


                                                    <ChevronRight
                                                        size={16}
                                                        className="
                                                            text-zinc-700
                                                            transition
                                                            group-hover:translate-x-0.5
                                                            group-hover:text-zinc-400
                                                        "
                                                    />

                                                </motion.button>
                                            );
                                        }
                                    )}

                            </div>


                            {/* Mobile */}

                            <div className="md:hidden">

                                {workers
                                    .slice(0, 8)
                                    .map(
                                        (
                                            worker,
                                            index
                                        ) => {
                                            const workerUser =
                                                worker?.user ||
                                                {};


                                            const workerId =
                                                worker?._id ||
                                                workerUser?._id;


                                            const workerStatus =
                                                workerUser?.status ||
                                                (
                                                    worker?.isActive
                                                        ? 'ACTIVE'
                                                        : 'DEACTIVATED'
                                                );


                                            const workerName =
                                                workerUser?.name ||
                                                'Unnamed worker';


                                            const workerEmail =
                                                workerUser?.email ||
                                                'No email';


                                            const workerPosition =
                                                worker?.position ||
                                                'Team Member';


                                            const department =
                                                worker?.department?.name ||
                                                'No department';


                                            return (
                                                <button
                                                    type="button"
                                                    key={
                                                        workerId ||
                                                        index
                                                    }
                                                    onClick={() => {
                                                        if (
                                                            !workerId ||
                                                            !isValidObjectId(
                                                                workerId
                                                            )
                                                        ) {
                                                            setError(
                                                                'This worker does not have a valid ID.'
                                                            );

                                                            return;
                                                        }

                                                        router.push(
                                                            `/admin/users/companies/${companyMongoId}/workers/${workerId}`
                                                        );
                                                    }}
                                                    className="
                                                        flex
                                                        w-full
                                                        items-center
                                                        gap-3
                                                        border-b
                                                        border-white/[0.05]
                                                        px-5
                                                        py-4
                                                        text-left
                                                        last:border-b-0
                                                        active:bg-white/[0.03]
                                                    "
                                                >

                                                    <div className="
                                                        flex
                                                        h-11
                                                        w-11
                                                        shrink-0
                                                        items-center
                                                        justify-center
                                                        overflow-hidden
                                                        rounded-xl
                                                        border
                                                        border-white/[0.07]
                                                        bg-white/[0.04]
                                                        text-xs
                                                        font-semibold
                                                        text-zinc-300
                                                    ">
                                                        {workerUser?.image ? (
                                                            <img
                                                                src={
                                                                    workerUser.image
                                                                }
                                                                alt=""
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            getInitials(
                                                                workerName
                                                            )
                                                        )}
                                                    </div>


                                                    <div className="min-w-0 flex-1">

                                                        <div className="flex items-center justify-between gap-3">

                                                            <p className="truncate text-sm font-medium text-zinc-200">
                                                                {
                                                                    workerName
                                                                }
                                                            </p>


                                                            <ChevronRight
                                                                size={15}
                                                                className="shrink-0 text-zinc-700"
                                                            />

                                                        </div>


                                                        <p className="mt-0.5 truncate text-xs text-zinc-600">
                                                            {
                                                                workerEmail
                                                            }
                                                        </p>


                                                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">

                                                            <span className="text-xs text-zinc-500">
                                                                {
                                                                    workerPosition
                                                                }
                                                            </span>


                                                            <span className="text-zinc-700">
                                                                •
                                                            </span>


                                                            <span className="truncate text-xs text-zinc-600">
                                                                {
                                                                    department
                                                                }
                                                            </span>


                                                            <WorkerStatus
                                                                status={
                                                                    workerStatus
                                                                }
                                                            />

                                                        </div>

                                                    </div>

                                                </button>
                                            );
                                        }
                                    )}

                            </div>


                            {/* More workers */}

                            {workers.length > 8 && (
                                <div className="border-t border-white/[0.05] p-4 text-center">

                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(
                                                `/admin/users/companies/${companyMongoId}/workers`
                                            )
                                        }
                                        className="
                                            inline-flex
                                            items-center
                                            gap-1.5
                                            text-xs
                                            font-medium
                                            text-emerald-400
                                            transition
                                            hover:text-emerald-300
                                        "
                                    >
                                        View all{' '}

                                        {workerCount}{' '}

                                        workers

                                        <ChevronRight size={14} />
                                    </button>

                                </div>
                            )}

                        </div>
                    )}

                </motion.section>


                {/* ─────────────────────────────────────────────
                    Metadata
                ───────────────────────────────────────────── */}

                <section className="mt-6 pb-8">

                    <div className="
                        flex
                        flex-col
                        gap-2
                        border-t
                        border-white/[0.05]
                        pt-5
                        text-[11px]
                        text-zinc-700
                        sm:flex-row
                        sm:items-center
                        sm:justify-between
                    ">

                        <span>
                            Company ID:{' '}

                            <span className="font-mono text-zinc-600">
                                {company?._id ||
                                    'Unavailable'}
                            </span>
                        </span>


                        <span>
                            {company?.updatedAt
                                ? `Updated ${formatDateTime(
                                      company.updatedAt
                                  )}`
                                : 'No update timestamp'}
                        </span>

                    </div>

                </section>

            </div>


            {/* ─────────────────────────────────────────────────
                Confirmation modal
            ───────────────────────────────────────────────── */}

            <AnimatePresence>

                {confirmAction && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">

                        <motion.button
                            type="button"
                            aria-label="Close confirmation"
                            initial={{
                                opacity: 0,
                            }}
                            animate={{
                                opacity: 1,
                            }}
                            exit={{
                                opacity: 0,
                            }}
                            onClick={() =>
                                setConfirmAction(
                                    null
                                )
                            }
                            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
                        />


                        <motion.div
                            initial={{
                                opacity: 0,
                                y: 12,
                                scale: 0.97,
                            }}
                            animate={{
                                opacity: 1,
                                y: 0,
                                scale: 1,
                            }}
                            exit={{
                                opacity: 0,
                                y: 12,
                                scale: 0.97,
                            }}
                            className="
                                relative
                                z-10
                                w-full
                                max-w-md
                                rounded-[26px]
                                border
                                border-white/[0.09]
                                bg-slate-900
                                p-6
                                shadow-2xl
                                shadow-black/50
                            "
                        >

                            <button
                                type="button"
                                onClick={() =>
                                    setConfirmAction(
                                        null
                                    )
                                }
                                className="
                                    absolute
                                    right-4
                                    top-4
                                    flex
                                    h-8
                                    w-8
                                    items-center
                                    justify-center
                                    rounded-lg
                                    text-zinc-600
                                    transition
                                    hover:bg-white/[0.05]
                                    hover:text-zinc-300
                                "
                                aria-label="Close"
                            >
                                <X size={17} />
                            </button>


                            <div className="
                                flex
                                h-12
                                w-12
                                items-center
                                justify-center
                                rounded-2xl
                                border
                                border-white/[0.07]
                                bg-white/[0.04]
                                text-zinc-300
                            ">
                                {confirmAction ===
                                'suspend' ? (
                                    <ShieldX size={21} />
                                ) : (
                                    <RefreshCw size={21} />
                                )}
                            </div>


                            <h3 className="mt-5 text-lg font-semibold tracking-tight text-white">
                                {confirmAction ===
                                'suspend'
                                    ? 'Suspend company?'
                                    : 'Reactivate company?'}
                            </h3>


                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                {confirmAction ===
                                'suspend'
                                    ? `This will suspend ${companyName} and its company account. The company will no longer be able to access the platform until it is reactivated.`
                                    : `This will reactivate ${companyName} and restore its company account to an active state.`}
                            </p>


                            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">

                                <button
                                    type="button"
                                    onClick={() =>
                                        setConfirmAction(
                                            null
                                        )
                                    }
                                    className="
                                        rounded-xl
                                        border
                                        border-white/[0.08]
                                        bg-white/[0.035]
                                        px-4
                                        py-2.5
                                        text-sm
                                        font-medium
                                        text-zinc-300
                                        transition
                                        hover:bg-white/[0.06]
                                        hover:text-white
                                    "
                                >
                                    Cancel
                                </button>


                                <button
                                    type="button"
                                    onClick={
                                        confirmAction ===
                                        'suspend'
                                            ? handleSuspend
                                            : handleReactivate
                                    }
                                    disabled={
                                        actionLoading
                                    }
                                    className={`
                                        rounded-xl
                                        px-4
                                        py-2.5
                                        text-sm
                                        font-semibold
                                        transition
                                        disabled:opacity-50
                                        ${
                                            confirmAction ===
                                            'suspend'
                                                ? 'bg-red-500 text-white hover:bg-red-400'
                                                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                                        }
                                    `}
                                >
                                    {actionLoading
                                        ? 'Processing...'
                                        : confirmAction ===
                                          'suspend'
                                        ? 'Suspend Company'
                                        : 'Reactivate Company'}
                                </button>

                            </div>

                        </motion.div>

                    </div>
                )}

            </AnimatePresence>

        </main>
    );
}