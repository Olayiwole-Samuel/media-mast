'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Building2,
    CalendarDays,
    CheckCircle2,
    CircleAlert,
    Clock3,
    Edit3,
    Loader2,
    Mail,
    Phone,
    RefreshCw,
    Shield,
    ShieldCheck,
    Trash2,
    User,
    UserCheck,
    UserRoundX,
    Users,
    X,
} from 'lucide-react';

import {
    getAdminCompany,
    getAdminCompanyWorker,
    activateAdminCompanyWorker,
    deactivateAdminCompanyWorker,
    reactivateAdminCompanyWorker,
    removeAdminCompanyWorker,
} from '@/lib/api';

function normalizeWorkerResponse(response) {
    return (
        response?.data?.worker ||
        response?.worker ||
        response?.data ||
        response
    );
}

function normalizeCompanyResponse(response) {
    return (
        response?.data?.company ||
        response?.company ||
        response?.data ||
        response
    );
}

function getErrorMessage(error) {
    if (!error) {
        return 'Something went wrong. Please try again.';
    }

    if (typeof error === 'string') {
        return error;
    }

    return (
        error?.response?.data?.message ||
        error?.data?.message ||
        error?.message ||
        'Something went wrong. Please try again.'
    );
}

function formatDate(date) {
    if (!date) return '—';

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return '—';
    }

    return parsed.toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function formatDateTime(date) {
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
}

function getInitials(name) {
    if (!name) return '?';

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}

function getStatusLabel(status) {
    switch (status) {
        case 'ACTIVE':
            return 'Active';

        case 'INACTIVE':
            return 'Inactive';

        case 'DEACTIVATED':
            return 'Deactivated';

        case 'SUSPENDED':
            return 'Suspended';

        case 'PENDING':
            return 'Pending';

        default:
            return status || 'Unknown';
    }
}

function StatusBadge({ status }) {
    const normalized = String(status || '').toUpperCase();

    let classes =
        'border-white/[0.08] bg-white/[0.04] text-slate-400';

    let dot = 'bg-slate-500';

    if (normalized === 'ACTIVE') {
        classes =
            'border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300';

        dot = 'bg-emerald-400';
    }

    if (
        normalized === 'DEACTIVATED' ||
        normalized === 'INACTIVE'
    ) {
        classes =
            'border-orange-400/15 bg-orange-400/[0.07] text-orange-300';

        dot = 'bg-orange-400';
    }

    if (normalized === 'SUSPENDED') {
        classes =
            'border-red-400/15 bg-red-400/[0.07] text-red-300';

        dot = 'bg-red-400';
    }

    if (normalized === 'PENDING') {
        classes =
            'border-yellow-400/15 bg-yellow-400/[0.07] text-yellow-300';

        dot = 'bg-yellow-400';
    }

    return (
        <span
            className={`
                inline-flex
                items-center
                gap-2
                rounded-full
                border
                px-2.5
                py-1
                text-[11px]
                font-medium
                ${classes}
            `}
        >
            <span
                className={`h-1.5 w-1.5 rounded-full ${dot}`}
            />

            {getStatusLabel(status)}
        </span>
    );
}

function InfoItem({
    icon: Icon,
    label,
    value,
    children,
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025]">
                <Icon
                    size={16}
                    className="text-slate-500"
                />
            </div>

            <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                    {label}
                </p>

                {children || (
                    <p className="mt-1 break-words text-sm text-slate-300">
                        {value || '—'}
                    </p>
                )}
            </div>
        </div>
    );
}

function Section({
    title,
    description,
    children,
}) {
    return (
        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-900/60">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
                <h2 className="text-sm font-semibold text-white">
                    {title}
                </h2>

                {description && (
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                        {description}
                    </p>
                )}
            </div>

            <div className="p-5 sm:p-6">
                {children}
            </div>
        </section>
    );
}

function ConfirmModal({
    open,
    title,
    description,
    confirmLabel,
    danger = false,
    busy = false,
    onConfirm,
    onCancel,
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/50">
                <div className="p-5 sm:p-6">
                    <div className="mb-5 flex items-start justify-between gap-4">
                        <div
                            className={`
                                flex
                                h-10
                                w-10
                                shrink-0
                                items-center
                                justify-center
                                rounded-xl
                                ${
                                    danger
                                        ? 'bg-red-400/[0.08] text-red-400'
                                        : 'bg-emerald-400/[0.08] text-emerald-400'
                                }
                            `}
                        >
                            {danger ? (
                                <Trash2 size={18} />
                            ) : (
                                <ShieldCheck size={18} />
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={busy}
                            className="text-slate-600 transition hover:text-white disabled:opacity-40"
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <h2 className="text-base font-semibold text-white">
                        {title}
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        {description}
                    </p>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] bg-slate-950/30 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="h-10 rounded-xl border border-white/[0.08] px-4 text-sm font-medium text-slate-400 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={`
                            inline-flex
                            h-10
                            items-center
                            justify-center
                            gap-2
                            rounded-xl
                            px-4
                            text-sm
                            font-semibold
                            transition
                            disabled:cursor-not-allowed
                            disabled:opacity-50
                            ${
                                danger
                                    ? 'bg-red-500 text-white hover:bg-red-400'
                                    : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                            }
                        `}
                    >
                        {busy && (
                            <Loader2
                                size={15}
                                className="animate-spin"
                            />
                        )}

                        {busy
                            ? 'Processing…'
                            : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function CompanyWorkerProfilePage() {
    const params = useParams();
    const router = useRouter();

    const companyId = params?.id;
    const workerId = params?.workerId;

    const [worker, setWorker] = useState(null);
    const [company, setCompany] = useState(null);

    const [loading, setLoading] = useState(true);
    const [actionBusy, setActionBusy] =
        useState(false);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [confirmAction, setConfirmAction] =
        useState(null);

    const loadData = async () => {
        if (!companyId || !workerId) return;

        try {
            setLoading(true);
            setError('');

            const [
                workerResponse,
                companyResponse,
            ] = await Promise.all([
                getAdminCompanyWorker(
                    companyId,
                    workerId
                ),
                getAdminCompany(companyId),
            ]);

            const workerData =
                normalizeWorkerResponse(
                    workerResponse
                );

            const companyData =
                normalizeCompanyResponse(
                    companyResponse
                );

            if (!workerData?._id) {
                throw new Error(
                    'Worker information could not be loaded.'
                );
            }

            setWorker(workerData);
            setCompany(companyData);
        } catch (err) {
            console.error(
                'Failed to load worker:',
                err
            );

            setError(
                getErrorMessage(err)
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, [companyId, workerId]);

    const user = useMemo(() => {
        return (
            worker?.user ||
            worker?.userId ||
            worker?.account ||
            {}
        );
    }, [worker]);

    const workerName =
        worker?.name ||
        user?.name ||
        'Unnamed Worker';

    const email =
        worker?.email ||
        user?.email ||
        '—';

    const phone =
        worker?.phone ||
        user?.phone ||
        '—';

    const status =
        worker?.status ||
        user?.status ||
        (worker?.isActive
            ? 'ACTIVE'
            : 'INACTIVE');

    const position =
        worker?.position ||
        worker?.role ||
        'Team Member';

    const department =
        worker?.department ||
        worker?.departmentId ||
        null;

    const departmentName =
        typeof department === 'string'
            ? department
            : department?.name ||
              department?.title ||
              'No department';

    const permissions =
        worker?.permissions ||
        [];

    const isOwner =
        position === 'Company Owner';

    const isActive =
        String(status).toUpperCase() ===
        'ACTIVE';

    const isDeactivated =
        ['DEACTIVATED', 'INACTIVE'].includes(
            String(status).toUpperCase()
        );

    const handleAction = async () => {
        if (!confirmAction || actionBusy) {
            return;
        }

        const action = confirmAction;

        try {
            setActionBusy(true);
            setError('');
            setSuccess('');

            if (action === 'activate') {
                await activateAdminCompanyWorker(
                    companyId,
                    workerId
                );

                setSuccess(
                    'Worker activated successfully.'
                );
            }

            if (action === 'deactivate') {
                await deactivateAdminCompanyWorker(
                    companyId,
                    workerId
                );

                setSuccess(
                    'Worker deactivated successfully.'
                );
            }

            if (action === 'reactivate') {
                await reactivateAdminCompanyWorker(
                    companyId,
                    workerId
                );

                setSuccess(
                    'Worker reactivated successfully.'
                );
            }

            if (action === 'remove') {
                await removeAdminCompanyWorker(
                    companyId,
                    workerId
                );

                setConfirmAction(null);

                router.push(
                    `/admin/users/companies/${companyId}/workers`
                );

                return;
            }

            setConfirmAction(null);

            await loadData();
        } catch (err) {
            console.error(
                `Failed to ${action} worker:`,
                err
            );

            setError(
                getErrorMessage(err)
            );
            setConfirmAction(null);
        } finally {
            setActionBusy(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 text-white">
                <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                    <div className="mb-7 h-5 w-32 animate-pulse rounded bg-slate-900" />

                    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-900/60">
                        <div className="p-6 sm:p-8">
                            <div className="flex items-center gap-5">
                                <div className="h-20 w-20 animate-pulse rounded-2xl bg-slate-800" />

                                <div className="space-y-3">
                                    <div className="h-5 w-44 animate-pulse rounded bg-slate-800" />
                                    <div className="h-3 w-60 animate-pulse rounded bg-slate-800" />
                                    <div className="h-5 w-20 animate-pulse rounded-full bg-slate-800" />
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 border-t border-white/[0.06] p-6 sm:grid-cols-3">
                            {Array.from({
                                length: 3,
                            }).map((_, index) => (
                                <div
                                    key={index}
                                    className="h-16 animate-pulse rounded-xl bg-slate-950"
                                />
                            ))}
                        </div>
                    </div>

                    <div className="mt-5 grid gap-5 lg:grid-cols-2">
                        <div className="h-72 animate-pulse rounded-2xl bg-slate-900" />
                        <div className="h-72 animate-pulse rounded-2xl bg-slate-900" />
                    </div>
                </div>
            </div>
        );
    }

    if (error && !worker) {
        return (
            <div className="min-h-screen bg-slate-950 text-white">
                <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                    <Link
                        href={`/admin/users/companies/${companyId}/workers`}
                        className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-white"
                    >
                        <ArrowLeft size={16} />
                        Back to Workers
                    </Link>

                    <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-6">
                        <div className="flex items-start gap-3">
                            <CircleAlert
                                size={19}
                                className="mt-0.5 shrink-0 text-red-400"
                            />

                            <div>
                                <h1 className="text-sm font-semibold text-white">
                                    Unable to load worker
                                </h1>

                                <p className="mt-1 text-sm leading-6 text-red-300/70">
                                    {error}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={loadData}
                            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.06]"
                        >
                            <RefreshCw size={15} />
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-slate-950 text-white">
                <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

                    {/* Back */}
                    <Link
                        href={`/admin/users/companies/${companyId}/workers`}
                        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-white"
                    >
                        <ArrowLeft size={16} />
                        Back to Workers
                    </Link>

                    {/* Error */}
                    {error && (
                        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3.5">
                            <CircleAlert
                                size={17}
                                className="mt-0.5 shrink-0 text-red-400"
                            />

                            <p className="flex-1 text-sm text-red-300/80">
                                {error}
                            </p>

                            <button
                                type="button"
                                onClick={() =>
                                    setError('')
                                }
                                className="text-red-400/60 transition hover:text-red-300"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {/* Success */}
                    {success && (
                        <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3.5">
                            <CheckCircle2
                                size={17}
                                className="shrink-0 text-emerald-400"
                            />

                            <p className="flex-1 text-sm text-emerald-300">
                                {success}
                            </p>

                            <button
                                type="button"
                                onClick={() =>
                                    setSuccess('')
                                }
                                className="text-emerald-400/60 transition hover:text-emerald-300"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {/* Profile Hero */}
                    <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-900/60">
                        <div className="p-5 sm:p-7">
                            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.07] text-lg font-semibold text-emerald-300 sm:h-20 sm:w-20 sm:text-xl">
                                        {getInitials(
                                            workerName
                                        )}
                                    </div>

                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
                                                {workerName}
                                            </h1>

                                            {isOwner && (
                                                <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                                                    Company Owner
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-1 break-all text-sm text-slate-500">
                                            {email}
                                        </p>

                                        <div className="mt-3">
                                            <StatusBadge
                                                status={
                                                    status
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Link
                                        href={`/admin/users/companies/${companyId}/workers/${workerId}/edit`}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                                    >
                                        <Edit3 size={15} />
                                        Edit
                                    </Link>

                                    {!isActive &&
                                        !isDeactivated &&
                                        status !==
                                            'SUSPENDED' && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setConfirmAction(
                                                        'activate'
                                                    )
                                                }
                                                disabled={
                                                    actionBusy
                                                }
                                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                                            >
                                                <UserCheck
                                                    size={15}
                                                />
                                                Activate
                                            </button>
                                        )}

                                    {isActive && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setConfirmAction(
                                                    'deactivate'
                                                )
                                            }
                                            disabled={
                                                actionBusy
                                            }
                                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-orange-400/15 bg-orange-400/[0.06] px-4 text-sm font-medium text-orange-300 transition hover:bg-orange-400/[0.1] disabled:opacity-50"
                                        >
                                            <ShieldCheck
                                                size={15}
                                            />
                                            Deactivate
                                        </button>
                                    )}

                                    {isDeactivated && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setConfirmAction(
                                                    'reactivate'
                                                )
                                            }
                                            disabled={
                                                actionBusy
                                            }
                                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                                        >
                                            <RefreshCw
                                                size={15}
                                            />
                                            Reactivate
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setConfirmAction(
                                                'remove'
                                            )
                                        }
                                        disabled={
                                            actionBusy
                                        }
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 text-sm font-medium text-red-300 transition hover:bg-red-500/[0.1] disabled:opacity-50"
                                    >
                                        <UserRoundX
                                            size={15}
                                        />
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Quick information */}
                        <div className="grid border-t border-white/[0.06] sm:grid-cols-3">
                            <div className="border-b border-white/[0.06] p-5 sm:border-b-0 sm:border-r">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.03]">
                                        <Building2
                                            size={16}
                                            className="text-slate-500"
                                        />
                                    </div>

                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                            Company
                                        </p>

                                        <p className="mt-1 truncate text-sm font-medium text-slate-300">
                                            {company?.name ||
                                                '—'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-b border-white/[0.06] p-5 sm:border-b-0 sm:border-r">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.03]">
                                        <Shield
                                            size={16}
                                            className="text-slate-500"
                                        />
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                            Position
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-slate-300">
                                            {position}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.03]">
                                        <Users
                                            size={16}
                                            className="text-slate-500"
                                        />
                                    </div>

                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                            Department
                                        </p>

                                        <p className="mt-1 text-sm font-medium text-slate-300">
                                            {departmentName}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Details */}
                    <div className="mt-5 grid gap-5 lg:grid-cols-2">

                        <Section
                            title="Account Information"
                            description="Basic information associated with this worker account."
                        >
                            <div className="grid gap-6 sm:grid-cols-2">
                                <InfoItem
                                    icon={User}
                                    label="Full Name"
                                    value={
                                        workerName
                                    }
                                />

                                <InfoItem
                                    icon={Mail}
                                    label="Email"
                                    value={
                                        email
                                    }
                                />

                                <InfoItem
                                    icon={Phone}
                                    label="Phone"
                                    value={
                                        phone
                                    }
                                />

                                <InfoItem
                                    icon={Shield}
                                    label="Account Status"
                                >
                                    <div className="mt-1">
                                        <StatusBadge
                                            status={
                                                status
                                            }
                                        />
                                    </div>
                                </InfoItem>
                            </div>
                        </Section>

                        <Section
                            title="Employment Details"
                            description="The worker's role and relationship with the company."
                        >
                            <div className="grid gap-6 sm:grid-cols-2">
                                <InfoItem
                                    icon={ShieldCheck}
                                    label="Position"
                                    value={
                                        position
                                    }
                                />

                                <InfoItem
                                    icon={Users}
                                    label="Department"
                                    value={
                                        departmentName
                                    }
                                />

                                <InfoItem
                                    icon={Building2}
                                    label="Company"
                                    value={
                                        company?.name
                                    }
                                />

                                <InfoItem
                                    icon={CalendarDays}
                                    label="Joined"
                                    value={formatDate(
                                        worker?.createdAt ||
                                            user?.createdAt
                                    )}
                                />
                            </div>
                        </Section>

                        {/* Permissions */}
                        <Section
                            title="Permissions"
                            description="Access currently assigned to this worker."
                        >
                            {permissions.length ===
                            0 ? (
                                <div className="rounded-xl border border-white/[0.05] bg-slate-950/50 px-4 py-5 text-center">
                                    <Shield
                                        size={20}
                                        className="mx-auto text-slate-700"
                                    />

                                    <p className="mt-2 text-xs text-slate-600">
                                        No specific permissions
                                        assigned.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {permissions.map(
                                        (
                                            permission,
                                            index
                                        ) => (
                                            <span
                                                key={`${permission}-${index}`}
                                                className="rounded-lg border border-emerald-400/10 bg-emerald-400/[0.05] px-3 py-2 text-xs font-medium text-emerald-300"
                                            >
                                                {permission}
                                            </span>
                                        )
                                    )}
                                </div>
                            )}

                            {isOwner && (
                                <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.035] px-4 py-3.5">
                                    <ShieldCheck
                                        size={16}
                                        className="mt-0.5 shrink-0 text-emerald-400"
                                    />

                                    <p className="text-xs leading-5 text-slate-500">
                                        This worker is the{' '}
                                        <span className="text-emerald-300">
                                            Company Owner
                                        </span>
                                        . Owner status is shown
                                        for identification and does
                                        not prevent administrative
                                        management.
                                    </p>
                                </div>
                            )}
                        </Section>

                        {/* Account Timeline */}
                        <Section
                            title="Account Timeline"
                            description="Important dates associated with this worker."
                        >
                            <div className="space-y-5">
                                <InfoItem
                                    icon={CalendarDays}
                                    label="Created"
                                    value={formatDateTime(
                                        worker?.createdAt ||
                                            user?.createdAt
                                    )}
                                />

                                <InfoItem
                                    icon={Clock3}
                                    label="Last Updated"
                                    value={formatDateTime(
                                        worker?.updatedAt ||
                                            user?.updatedAt
                                    )}
                                />

                                <InfoItem
                                    icon={UserCheck}
                                    label="Accepted"
                                    value={formatDateTime(
                                        worker?.acceptedAt
                                    )}
                                />

                                <InfoItem
                                    icon={CalendarDays}
                                    label="Invited"
                                    value={formatDateTime(
                                        worker?.invitedAt
                                    )}
                                />
                            </div>
                        </Section>
                    </div>

                    {/* Worker ID */}
                    <div className="mt-5 rounded-xl border border-white/[0.05] bg-slate-900/30 px-4 py-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                                Worker ID
                            </span>

                            <span className="break-all font-mono text-[11px] text-slate-600">
                                {worker?._id ||
                                    workerId}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation */}
            <ConfirmModal
                open={
                    confirmAction ===
                    'activate'
                }
                title="Activate worker?"
                description={`This will activate ${workerName}'s worker account and allow them to access the company workspace.`}
                confirmLabel="Activate Worker"
                busy={actionBusy}
                onConfirm={handleAction}
                onCancel={() =>
                    setConfirmAction(null)
                }
            />

            <ConfirmModal
                open={
                    confirmAction ===
                    'deactivate'
                }
                title="Deactivate worker?"
                description={`This will deactivate ${workerName}'s worker account. They will no longer be able to access the company workspace until reactivated.`}
                confirmLabel="Deactivate Worker"
                danger
                busy={actionBusy}
                onConfirm={handleAction}
                onCancel={() =>
                    setConfirmAction(null)
                }
            />

            <ConfirmModal
                open={
                    confirmAction ===
                    'reactivate'
                }
                title="Reactivate worker?"
                description={`This will reactivate ${workerName}'s worker account and restore their access to the company workspace.`}
                confirmLabel="Reactivate Worker"
                busy={actionBusy}
                onConfirm={handleAction}
                onCancel={() =>
                    setConfirmAction(null)
                }
            />

            <ConfirmModal
                open={
                    confirmAction ===
                    'remove'
                }
                title="Remove worker?"
                description={`This will remove ${workerName} from the company. Their employee relationship will be deleted and their account will be deactivated.`}
                confirmLabel="Remove Worker"
                danger
                busy={actionBusy}
                onConfirm={handleAction}
                onCancel={() =>
                    setConfirmAction(null)
                }
            />
        </>
    );
}