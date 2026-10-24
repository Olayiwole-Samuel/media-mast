'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Building2,
    Check,
    CheckCircle2,
    ChevronRight,
    Clock3,
    Mail,
    Phone,
    Save,
    ShieldCheck,
    UserRound,
    Users,
    X,
} from 'lucide-react';

import {
    getAdminCompany,
    getAdminCompanyWorker,
    updateAdminCompanyWorker,
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
        response.worker ||
        response.company ||
        response
    );
};

const getWorkerData = (response) => {
    const data = getResponseData(response);

    if (!data) return null;

    return (
        data.worker ||
        data.data?.worker ||
        data.employee ||
        data.data?.employee ||
        data
    );
};

const getCompanyData = (response) => {
    const data = getResponseData(response);

    if (!data) return null;

    return (
        data.company ||
        data.data?.company ||
        data
    );
};

const getWorkerUser = (worker) => {
    return worker?.user || worker?.userId || {};
};

const getWorkerName = (worker) => {
    const user = getWorkerUser(worker);

    return (
        user?.name ||
        worker?.name ||
        ''
    );
};

const getWorkerEmail = (worker) => {
    const user = getWorkerUser(worker);

    return (
        user?.email ||
        worker?.email ||
        ''
    );
};

const getWorkerPhone = (worker) => {
    const user = getWorkerUser(worker);

    return (
        user?.phone ||
        worker?.phone ||
        ''
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

const getPosition = (worker) => {
    return worker?.position || 'Team Member';
};

const getDepartmentId = (worker) => {
    if (!worker?.departmentId) {
        return '';
    }

    if (typeof worker.departmentId === 'string') {
        return worker.departmentId;
    }

    return worker.departmentId?._id || '';
};

const getDepartmentName = (worker) => {
    const department =
        worker?.department ||
        worker?.departmentId;

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

const getPermissions = (worker) => {
    if (!Array.isArray(worker?.permissions)) {
        return [];
    }

    return worker.permissions.filter(
        (permission) => permission !== 'ALL_ACCESS'
    );
};

const hadAllAccess = (worker) =>
    Array.isArray(worker?.permissions) &&
    worker.permissions.includes('ALL_ACCESS');

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


// ─────────────────────────────────────────────────────────────
// Permission Options
// ─────────────────────────────────────────────────────────────
// IMPORTANT:
// These values exactly match the backend PERMISSIONS object.
// Do not change these values to broad names like CAMPAIGNS,
// BOOKINGS, TEAM, CREATIVES, etc.
// ─────────────────────────────────────────────────────────────

const PERMISSION_OPTIONS = [
    // Campaigns
    {
        value: 'CAMPAIGN_CREATE',
        label: 'Create Campaigns',
        description: 'Create new campaigns',
    },
    {
        value: 'CAMPAIGN_EDIT',
        label: 'Edit Campaigns',
        description: 'Modify existing campaigns',
    },
    {
        value: 'CAMPAIGN_DELETE',
        label: 'Delete Campaigns',
        description: 'Delete campaigns',
    },
    {
        value: 'CAMPAIGN_VIEW',
        label: 'View Campaigns',
        description: 'View campaign information',
    },
    {
        value: 'CAMPAIGN_APPROVE',
        label: 'Approve Campaigns',
        description: 'Approve campaign requests',
    },
    {
        value: 'CAMPAIGN_SUBMIT',
        label: 'Submit Campaigns',
        description: 'Submit campaigns for review',
    },

    // Bookings
    {
        value: 'BOOKING_CREATE',
        label: 'Create Bookings',
        description: 'Create new bookings',
    },
    {
        value: 'BOOKING_APPROVE',
        label: 'Approve Bookings',
        description: 'Approve booking requests',
    },
    {
        value: 'BOOKING_CANCEL',
        label: 'Cancel Bookings',
        description: 'Cancel existing bookings',
    },
    {
        value: 'BOOKING_VIEW',
        label: 'View Bookings',
        description: 'View booking information',
    },

    // Team
    {
        value: 'TEAM_VIEW',
        label: 'View Team',
        description: 'View company team members',
    },
    {
        value: 'TEAM_INVITE',
        label: 'Invite Team Members',
        description: 'Invite new team members',
    },
    {
        value: 'TEAM_REMOVE',
        label: 'Remove Team Members',
        description: 'Remove team members',
    },
    {
        value: 'TEAM_EDIT',
        label: 'Edit Team Members',
        description: 'Modify team member information',
    },

    // Creatives
    {
        value: 'CREATIVE_UPLOAD',
        label: 'Upload Creatives',
        description: 'Upload campaign creatives',
    },
    {
        value: 'CREATIVE_APPROVE',
        label: 'Approve Creatives',
        description: 'Approve creative content',
    },
    {
        value: 'CREATIVE_VIEW',
        label: 'View Creatives',
        description: 'View campaign creatives',
    },
    {
        value: 'CREATIVE_DELETE',
        label: 'Delete Creatives',
        description: 'Delete creative content',
    },

    // Analytics
    {
        value: 'ANALYTICS_VIEW',
        label: 'View Analytics',
        description: 'View performance analytics',
    },
    {
        value: 'ANALYTICS_EXPORT',
        label: 'Export Analytics',
        description: 'Export analytics data',
    },

    // Payments
    {
        value: 'PAYMENTS_VIEW',
        label: 'View Payments',
        description: 'View payment information',
    },
    {
        value: 'PAYMENTS_APPROVE',
        label: 'Approve Payments',
        description: 'Approve payment transactions',
    },

    // Administration
    {
        value: 'ADMIN_ACCESS',
        label: 'Admin Access',
        description: 'Access administrative features',
    },
    // ALL_ACCESS is the company owner's marker; workers can't be given it
    // (the server rejects it), so it is not offered.
];


// ─────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
    const normalized =
        String(status || '').toUpperCase();

    const config = {
        ACTIVE: {
            label: 'Active',
            className:
                'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
            dot: 'bg-emerald-400',
        },

        DEACTIVATED: {
            label: 'Deactivated',
            className:
                'border-red-400/20 bg-red-400/10 text-red-300',
            dot: 'bg-red-400',
        },

        SUSPENDED: {
            label: 'Suspended',
            className:
                'border-orange-400/20 bg-orange-400/10 text-orange-300',
            dot: 'bg-orange-400',
        },

        INACTIVE: {
            label: 'Inactive',
            className:
                'border-slate-400/20 bg-slate-400/10 text-slate-300',
            dot: 'bg-slate-400',
        },
    };

    const current =
        config[normalized] || {
            label: status || 'Unknown',
            className:
                'border-white/10 bg-white/[0.04] text-slate-400',
            dot: 'bg-slate-500',
        };

    return (
        <span
            className={`
                inline-flex items-center gap-2
                rounded-full border
                px-2.5 py-1
                text-[11px] font-medium
                ${current.className}
            `}
        >
            <span
                className={`h-1.5 w-1.5 rounded-full ${current.dot}`}
            />

            {current.label}
        </span>
    );
}


// ─────────────────────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────────────────────

function LoadingSkeleton() {
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">

                <div className="mb-8 flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-white/[0.05]" />

                    <div className="space-y-2">
                        <div className="h-5 w-48 animate-pulse rounded bg-white/[0.05]" />
                        <div className="h-3 w-64 animate-pulse rounded bg-white/[0.04]" />
                    </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1fr_320px]">

                    <div className="space-y-5">
                        <div className="h-[420px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />
                        <div className="h-[260px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />
                    </div>

                    <div className="h-[300px] animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.025]" />
                </div>
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function EditCompanyWorkerPage() {
    const params = useParams();
    const router = useRouter();

    // Plain values (strings), so they are stable dependencies as they are.
    const companyId = Array.isArray(params?.id)
        ? params.id[0]
        : params?.id;

    const workerId = Array.isArray(params?.workerId)
        ? params.workerId[0]
        : params?.workerId;


    // ─────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────

    const [company, setCompany] =
        useState(null);

    const [worker, setWorker] =
        useState(null);

    const [departments, setDepartments] =
        useState([]);

    const [loading, setLoading] =
        useState(true);

    const [saving, setSaving] =
        useState(false);

    const [error, setError] =
        useState('');

    const [success, setSuccess] =
        useState('');

    const [name, setName] =
        useState('');

    const [email, setEmail] =
        useState('');

    const [phone, setPhone] =
        useState('');

    const [position, setPosition] =
        useState('');

    const [departmentId, setDepartmentId] =
        useState('');

    const [permissions, setPermissions] =
        useState([]);

    // Legacy worker that still had ALL_ACCESS (no longer allowed).
    const [legacyAllAccess, setLegacyAllAccess] =
        useState(false);


    // ─────────────────────────────────────────────────────────
    // Load worker + company
    // ─────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        if (!companyId || !workerId) return;

        if (
            !isValidObjectId(companyId) ||
            !isValidObjectId(workerId)
        ) {
            setError(
                'Invalid company or worker ID.'
            );

            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError('');

            const [
                companyResponse,
                workerResponse,
            ] = await Promise.all([
                getAdminCompany(companyId),
                getAdminCompanyWorker(
                    companyId,
                    workerId
                ),
            ]);

            const companyData =
                getCompanyData(
                    companyResponse
                );

            const workerData =
                getWorkerData(
                    workerResponse
                );

            if (!workerData) {
                throw new Error(
                    'Worker could not be found.'
                );
            }

            setCompany(companyData);
            setWorker(workerData);

            setName(
                getWorkerName(workerData)
            );

            setEmail(
                getWorkerEmail(workerData)
            );

            setPhone(
                getWorkerPhone(workerData)
            );

            setPosition(
                getPosition(workerData)
            );

            setDepartmentId(
                getDepartmentId(workerData)
            );

            setPermissions(
                getPermissions(workerData)
            );

            setLegacyAllAccess(
                hadAllAccess(workerData)
            );

            /*
             * Department data can come from the worker response.
             * If the backend already provides a departments array,
             * use it.
             */
            const workerDepartments =
                workerData?.departments ||
                workerData?.companyDepartments ||
                companyData?.departments ||
                [];

            setDepartments(
                Array.isArray(workerDepartments)
                    ? workerDepartments
                    : []
            );

        } catch (err) {
            console.error(
                'Failed to load worker:',
                err
            );

            setError(
                err?.message ||
                'Failed to load worker.'
            );
        } finally {
            setLoading(false);
        }
    }, [
        companyId,
        workerId,
    ]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, [loadData]);


    // ─────────────────────────────────────────────────────────
    // Permissions
    // ─────────────────────────────────────────────────────────

    const togglePermission = (permission) => {
        setPermissions((current) =>
            current.includes(permission)
                ? current.filter(
                    (item) => item !== permission
                )
                : [...current, permission]
        );
    };


    // ─────────────────────────────────────────────────────────
    // Validation
    // ─────────────────────────────────────────────────────────

    const validateForm = () => {
        if (!name.trim()) {
            return 'Worker name is required.';
        }

        if (name.trim().length < 2) {
            return 'Worker name must be at least 2 characters.';
        }

        if (!email.trim()) {
            return 'Email address is required.';
        }

        const emailPattern =
            /^\S+@\S+\.\S+$/;

        if (
            !emailPattern.test(
                email.trim()
            )
        ) {
            return 'Please enter a valid email address.';
        }

        if (!position.trim()) {
            return 'Position is required.';
        }

        // Same rule as the server: only the owner holds this position.
        if (position.trim().toLowerCase() === 'company owner') {
            return 'Company Owner is reserved for the company owner. Choose another position.';
        }

        return '';
    };


    // ─────────────────────────────────────────────────────────
    // Save
    // ─────────────────────────────────────────────────────────

    const handleSubmit = async (event) => {
        event.preventDefault();

        setError('');
        setSuccess('');

        const validationError =
            validateForm();

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);

            const payload = {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                phone: phone.trim(),
                position: position.trim(),
                departmentId:
                    departmentId || null,
                permissions,
            };

            await updateAdminCompanyWorker(
                companyId,
                workerId,
                payload
            );

            setSuccess(
                'Worker updated successfully.'
            );

            /*
             * Give the user a short visual confirmation,
             * then return to the worker profile.
             */
            setTimeout(() => {
                router.push(
                    `/admin/users/companies/${companyId}/workers/${workerId}`
                );
            }, 700);

        } catch (err) {
            console.error(
                'Failed to update worker:',
                err
            );

            setError(
                err?.message ||
                'Failed to update worker.'
            );
        } finally {
            setSaving(false);
        }
    };


    // ─────────────────────────────────────────────────────────
    // Invalid route
    // ─────────────────────────────────────────────────────────

    if (
        !companyId ||
        !workerId ||
        (
            (
                !isValidObjectId(companyId) ||
                !isValidObjectId(workerId)
            ) &&
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
                        Invalid Worker
                    </h1>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        A valid company and worker ID
                        are required.
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


    if (loading) {
        return <LoadingSkeleton />;
    }


    // ─────────────────────────────────────────────────────────
    // Load error
    // ─────────────────────────────────────────────────────────

    if (error && !worker) {
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
                            Unable to load worker
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
                                Try Again
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        `/admin/users/companies/${companyId}/workers/${workerId}`
                                    )
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                            >
                                <ArrowLeft size={16} />
                                Worker Profile
                            </button>

                        </div>
                    </div>
                </div>
            </div>
        );
    }


    const workerStatus =
        getWorkerStatus(worker);

    const companyInitial =
        company?.name
            ?.trim()
            ?.charAt(0)
            ?.toUpperCase() || 'C';

    const workerName =
        getWorkerName(worker) ||
        'Worker';


    // ─────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-slate-950 text-white">

            <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">

                {/* Header */}
                <header className="mb-7">

                    <div className="flex items-start gap-3">

                        <button
                            type="button"
                            onClick={() =>
                                router.push(
                                    `/admin/users/companies/${companyId}/workers/${workerId}`
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
                            aria-label="Back to worker profile"
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

                                <button
                                    type="button"
                                    onClick={() =>
                                        router.push(
                                            `/admin/users/companies/${companyId}/workers`
                                        )
                                    }
                                    className="transition hover:text-slate-300"
                                >
                                    Workers
                                </button>

                                <ChevronRight size={13} />

                                <span className="max-w-[160px] truncate text-slate-400">
                                    {workerName}
                                </span>

                                <ChevronRight size={13} />

                                <span className="text-slate-400">
                                    Edit
                                </span>

                            </div>

                            <div className="flex items-center gap-3">

                                <div className="hidden h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] sm:flex">
                                    <span className="text-sm font-semibold text-emerald-400">
                                        {companyInitial}
                                    </span>
                                </div>

                                <div className="min-w-0">

                                    <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
                                        Edit Worker
                                    </h1>

                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                                        <span>
                                            Update {workerName}&apos;s
                                            account and company access
                                        </span>

                                        <StatusBadge
                                            status={
                                                workerStatus
                                            }
                                        />
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>
                </header>


                {/* Messages */}
                {legacyAllAccess && (
                    <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] px-4 py-3.5 text-sm text-amber-200">
                        This worker had <strong>All Access</strong>, which workers can no longer have.
                        Choose the specific permissions they need below; saving replaces it.
                    </div>
                )}

                {error && (
                    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-400/15 bg-red-400/[0.06] px-4 py-3.5">

                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-400/10">
                            <X
                                size={15}
                                className="text-red-400"
                            />
                        </div>

                        <div className="min-w-0">
                            <p className="text-sm font-medium text-red-300">
                                Update failed
                            </p>

                            <p className="mt-0.5 text-xs leading-5 text-red-300/70">
                                {error}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                setError('')
                            }
                            className="ml-auto shrink-0 p-1 text-red-400/60 transition hover:text-red-300"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                {success && (
                    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-3.5">

                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10">
                            <CheckCircle2
                                size={15}
                                className="text-emerald-400"
                            />
                        </div>

                        <div>
                            <p className="text-sm font-medium text-emerald-300">
                                Changes saved
                            </p>

                            <p className="mt-0.5 text-xs text-emerald-300/70">
                                Redirecting to worker profile...
                            </p>
                        </div>
                    </div>
                )}


                <form
                    onSubmit={handleSubmit}
                    className="grid gap-5 lg:grid-cols-[1fr_330px]"
                >

                    {/* Main */}
                    <div className="space-y-5">

                        {/* Personal Information */}
                        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025]">

                            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">

                                <div className="flex items-center gap-3">

                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
                                        <UserRound
                                            size={16}
                                            className="text-slate-400"
                                        />
                                    </div>

                                    <div>
                                        <h2 className="text-sm font-semibold text-white">
                                            Personal Information
                                        </h2>

                                        <p className="mt-0.5 text-xs text-slate-600">
                                            Basic information for this worker.
                                        </p>
                                    </div>

                                </div>
                            </div>


                            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">

                                {/* Name */}
                                <div className="sm:col-span-2">

                                    <label className="mb-2 block text-xs font-medium text-slate-400">
                                        Full name
                                    </label>

                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(event) =>
                                            setName(
                                                event.target.value
                                            )
                                        }
                                        placeholder="Enter worker name"
                                        disabled={saving}
                                        className="
                                            w-full rounded-xl
                                            border border-white/[0.08]
                                            bg-white/[0.035]
                                            px-3.5 py-3
                                            text-sm text-white
                                            outline-none
                                            placeholder:text-slate-600
                                            transition
                                            focus:border-emerald-400/30
                                            focus:bg-white/[0.05]
                                            focus:ring-2
                                            focus:ring-emerald-400/10
                                            disabled:cursor-not-allowed
                                            disabled:opacity-50
                                        "
                                    />

                                </div>


                                {/* Email */}
                                <div>

                                    <label className="mb-2 block text-xs font-medium text-slate-400">
                                        Email address
                                    </label>

                                    <div className="relative">

                                        <Mail
                                            size={16}
                                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"
                                        />

                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(event) =>
                                                setEmail(
                                                    event.target.value
                                                )
                                            }
                                            placeholder="worker@example.com"
                                            disabled={saving}
                                            className="
                                                w-full rounded-xl
                                                border border-white/[0.08]
                                                bg-white/[0.035]
                                                py-3 pl-10 pr-3.5
                                                text-sm text-white
                                                outline-none
                                                placeholder:text-slate-600
                                                transition
                                                focus:border-emerald-400/30
                                                focus:bg-white/[0.05]
                                                focus:ring-2
                                                focus:ring-emerald-400/10
                                                disabled:cursor-not-allowed
                                                disabled:opacity-50
                                            "
                                        />

                                    </div>
                                </div>


                                {/* Phone */}
                                <div>

                                    <label className="mb-2 block text-xs font-medium text-slate-400">
                                        Phone number
                                    </label>

                                    <div className="relative">

                                        <Phone
                                            size={16}
                                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"
                                        />

                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(event) =>
                                                setPhone(
                                                    event.target.value
                                                )
                                            }
                                            placeholder="+234..."
                                            disabled={saving}
                                            className="
                                                w-full rounded-xl
                                                border border-white/[0.08]
                                                bg-white/[0.035]
                                                py-3 pl-10 pr-3.5
                                                text-sm text-white
                                                outline-none
                                                placeholder:text-slate-600
                                                transition
                                                focus:border-emerald-400/30
                                                focus:bg-white/[0.05]
                                                focus:ring-2
                                                focus:ring-emerald-400/10
                                                disabled:cursor-not-allowed
                                                disabled:opacity-50
                                            "
                                        />

                                    </div>
                                </div>

                            </div>
                        </section>


                        {/* Company Role */}
                        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025]">

                            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">

                                <div className="flex items-center gap-3">

                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/10 bg-emerald-400/[0.05]">
                                        <Building2
                                            size={16}
                                            className="text-emerald-400"
                                        />
                                    </div>

                                    <div>
                                        <h2 className="text-sm font-semibold text-white">
                                            Company Role
                                        </h2>

                                        <p className="mt-0.5 text-xs text-slate-600">
                                            Define the worker&apos;s role within the company.
                                        </p>
                                    </div>

                                </div>
                            </div>


                            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">

                                {/* Position */}
                                <div>

                                    <label className="mb-2 block text-xs font-medium text-slate-400">
                                        Position
                                    </label>

                                    <div>
                                        <label className="mb-2 block text-xs font-medium text-slate-400">
                                            Position
                                        </label>

                                        <select
                                            value={position}
                                            onChange={(event) =>
                                                setPosition(
                                                    event.target.value
                                                )
                                            }
                                            disabled={saving}
                                            className="
            w-full rounded-xl
            border border-white/[0.08]
            bg-slate-900
            px-3.5 py-3
            text-sm text-white
            outline-none
            transition
            focus:border-emerald-400/30
            focus:ring-2
            focus:ring-emerald-400/10
            disabled:cursor-not-allowed
            disabled:opacity-50
        "
                                        >
                                            <option value="">
                                                Select position
                                            </option>

                                            <option value="Company Owner">
                                                Company Owner
                                            </option>

                                            <option value="Campaign Manager">
                                                Campaign Manager
                                            </option>

                                            <option value="Creative Team">
                                                Creative Team
                                            </option>

                                            <option value="Analyst">
                                                Analyst
                                            </option>

                                            <option value="Team Lead">
                                                Team Lead
                                            </option>

                                            <option value="Viewer">
                                                Viewer
                                            </option>

                                            <option value="Team Member">
                                                Team Member
                                            </option>
                                        </select>
                                    </div>

                                </div>


                                {/* Department */}
                                <div>

                                    <label className="mb-2 block text-xs font-medium text-slate-400">
                                        Department
                                    </label>

                                    {departments.length > 0 ? (
                                        <select
                                            value={departmentId}
                                            onChange={(event) =>
                                                setDepartmentId(
                                                    event.target.value
                                                )
                                            }
                                            disabled={saving}
                                            className="
                                                w-full rounded-xl
                                                border border-white/[0.08]
                                                bg-slate-900
                                                px-3.5 py-3
                                                text-sm text-white
                                                outline-none
                                                transition
                                                focus:border-emerald-400/30
                                                focus:ring-2
                                                focus:ring-emerald-400/10
                                                disabled:cursor-not-allowed
                                                disabled:opacity-50
                                            "
                                        >
                                            <option value="">
                                                No department
                                            </option>

                                            {departments.map(
                                                (department) => {
                                                    const departmentKey =
                                                        department?._id ||
                                                        department?.id ||
                                                        department?.name ||
                                                        department?.title;

                                                    const departmentValue =
                                                        department?._id ||
                                                        department?.id ||
                                                        '';

                                                    return (
                                                        <option
                                                            key={departmentKey}
                                                            value={departmentValue}
                                                        >
                                                            {department?.name ||
                                                                department?.title ||
                                                                'Department'}
                                                        </option>
                                                    );
                                                }
                                            )}
                                        </select>
                                    ) : (
                                        <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-3 text-sm text-slate-600">
                                            {getDepartmentName(
                                                worker
                                            )}
                                        </div>
                                    )}

                                </div>

                            </div>
                        </section>


                        {/* Permissions */}
                        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025]">

                            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">

                                <div className="flex items-center gap-3">

                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
                                        <ShieldCheck
                                            size={16}
                                            className="text-slate-400"
                                        />
                                    </div>

                                    <div>
                                        <h2 className="text-sm font-semibold text-white">
                                            Permissions
                                        </h2>

                                        <p className="mt-0.5 text-xs text-slate-600">
                                            Control what this worker can access.
                                        </p>
                                    </div>

                                </div>
                            </div>


                            <div className="space-y-2 p-5 sm:p-6">

                                {PERMISSION_OPTIONS.map(
                                    (permission) => {

                                        const selected =
                                            permissions.includes(
                                                permission.value
                                            );

                                        return (
                                            <button
                                                key={permission.value}
                                                type="button"
                                                onClick={() =>
                                                    togglePermission(
                                                        permission.value
                                                    )
                                                }
                                                disabled={saving}
                                                className={`
                                                    flex w-full
                                                    items-start gap-3
                                                    rounded-xl border
                                                    p-3.5
                                                    text-left
                                                    transition
                                                    disabled:cursor-not-allowed
                                                    disabled:opacity-50
                                                    ${selected
                                                        ? 'border-emerald-400/20 bg-emerald-400/[0.06]'
                                                        : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]'
                                                    }
                                                `}
                                            >

                                                <div
                                                    className={`
                                                        mt-0.5 flex h-5 w-5
                                                        shrink-0
                                                        items-center
                                                        justify-center
                                                        rounded-md border
                                                        transition
                                                        ${selected
                                                            ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                                                            : 'border-white/[0.12] bg-white/[0.03] text-transparent'
                                                        }
                                                    `}
                                                >
                                                    <Check
                                                        size={13}
                                                        strokeWidth={3}
                                                    />
                                                </div>

                                                <div className="min-w-0">
                                                    <p
                                                        className={`
                                                            text-xs font-semibold
                                                            ${selected
                                                                ? 'text-emerald-300'
                                                                : 'text-slate-300'
                                                            }
                                                        `}
                                                    >
                                                        {permission.label}
                                                    </p>

                                                    <p className="mt-1 text-[11px] leading-5 text-slate-600">
                                                        {permission.description}
                                                    </p>
                                                </div>

                                            </button>
                                        );
                                    }
                                )}

                            </div>
                        </section>

                    </div>


                    {/* Sidebar */}
                    <aside className="space-y-5">

                        {/* Worker Summary */}
                        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">

                            <div className="mb-4 flex items-center gap-3">

                                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/10 bg-emerald-400/[0.07]">
                                    <Users
                                        size={17}
                                        className="text-emerald-400"
                                    />
                                </div>

                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-slate-500">
                                        Company
                                    </p>

                                    <p className="truncate text-sm font-semibold text-white">
                                        {company?.name ||
                                            'Company'}
                                    </p>
                                </div>

                            </div>

                            <div className="space-y-3 border-t border-white/[0.06] pt-4">

                                <div className="flex items-start justify-between gap-3">
                                    <span className="text-xs text-slate-600">
                                        Worker
                                    </span>

                                    <span className="max-w-[190px] truncate text-right text-xs text-slate-300">
                                        {workerName}
                                    </span>
                                </div>

                                <div className="flex items-start justify-between gap-3">
                                    <span className="text-xs text-slate-600">
                                        Status
                                    </span>

                                    <StatusBadge
                                        status={
                                            workerStatus
                                        }
                                    />
                                </div>

                                <div className="flex items-start justify-between gap-3">
                                    <span className="text-xs text-slate-600">
                                        Department
                                    </span>

                                    <span className="max-w-[190px] truncate text-right text-xs text-slate-400">
                                        {getDepartmentName(
                                            worker
                                        )}
                                    </span>
                                </div>

                                <div className="flex items-start justify-between gap-3">
                                    <span className="text-xs text-slate-600">
                                        Joined
                                    </span>

                                    <span className="text-right text-xs text-slate-400">
                                        {formatDate(
                                            worker?.createdAt
                                        )}
                                    </span>
                                </div>

                            </div>
                        </section>


                        {/* Account Information */}
                        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">

                            <div className="mb-4 flex items-center gap-3">

                                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.035]">
                                    <ShieldCheck
                                        size={16}
                                        className="text-slate-400"
                                    />
                                </div>

                                <div>
                                    <h2 className="text-sm font-semibold text-white">
                                        Account
                                    </h2>

                                    <p className="mt-0.5 text-xs text-slate-600">
                                        Account details.
                                    </p>
                                </div>

                            </div>

                            <div className="space-y-3 border-t border-white/[0.06] pt-4">

                                <div>
                                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                        Worker ID
                                    </p>

                                    <p className="break-all text-xs text-slate-500">
                                        {workerId}
                                    </p>
                                </div>

                                <div>
                                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                        User ID
                                    </p>

                                    <p className="break-all text-xs text-slate-500">
                                        {getWorkerUser(worker)?._id ||
                                            getWorkerUser(worker)?.id ||
                                            '—'}
                                    </p>
                                </div>

                            </div>
                        </section>


                        {/* Save */}
                        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">

                            <button
                                type="submit"
                                disabled={saving}
                                className="
                                    flex w-full
                                    items-center justify-center
                                    gap-2 rounded-xl
                                    bg-emerald-400
                                    px-4 py-3
                                    text-sm font-semibold
                                    text-slate-950
                                    shadow-lg
                                    shadow-emerald-500/10
                                    transition
                                    hover:bg-emerald-300
                                    disabled:cursor-not-allowed
                                    disabled:opacity-50
                                "
                            >
                                {saving ? (
                                    <>
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        Save Changes
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        `/admin/users/companies/${companyId}/workers/${workerId}`
                                    )
                                }
                                disabled={saving}
                                className="
                                    mt-2 flex w-full
                                    items-center justify-center
                                    gap-2 rounded-xl
                                    border border-white/[0.08]
                                    bg-white/[0.025]
                                    px-4 py-3
                                    text-sm font-medium
                                    text-slate-400
                                    transition
                                    hover:bg-white/[0.05]
                                    hover:text-white
                                    disabled:cursor-not-allowed
                                    disabled:opacity-40
                                "
                            >
                                Cancel
                            </button>

                        </div>

                    </aside>

                </form>


                {/* Footer */}
                <div className="mt-6 flex flex-col gap-2 text-[11px] text-slate-700 sm:flex-row sm:items-center sm:justify-between">

                    <div className="flex items-center gap-2">
                        <Building2 size={12} />

                        <span>
                            {company?.name ||
                                'Company'}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <Clock3 size={12} />

                        <span>
                            Editing company worker
                        </span>
                    </div>

                </div>

            </div>
        </div>
    );
}