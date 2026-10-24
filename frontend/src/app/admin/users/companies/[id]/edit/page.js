'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Building2,
    Check,
    ChevronRight,
    Globe,
    Image as ImageIcon,
    Loader2,
    Mail,
    MapPin,
    Phone,
    Save,
    ShieldCheck,
    Sparkles,
    X,
} from 'lucide-react';

import {
    getAdminCompany,
    updateAdminCompany,
} from '@/lib/api';


// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const EMPTY_FORM = {
    name: '',
    slug: '',
    email: '',
    phone: '',
    logo: '',
    website: '',
    description: '',
    address: '',
    city: '',
    state: '',
    country: '',
    timezone: '',
    currency: '',
};

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

        workers:
            data.workers ||
            data.data?.workers ||
            [],

        workerCount:
            data.workerCount ??
            data.data?.workerCount ??
            0,

        activeWorkerCount:
            data.activeWorkerCount ??
            data.data?.activeWorkerCount ??
            0,
    };
};

const normalizeCompanyForm = (company) => {
    if (!company) {
        return { ...EMPTY_FORM };
    }

    return {
        name: company.name ?? '',
        slug: company.slug ?? '',
        email: company.email ?? '',
        phone: company.phone ?? '',
        logo: company.logo ?? '',
        website: company.website ?? '',
        description: company.description ?? '',
        address: company.address ?? '',
        city: company.city ?? '',
        state: company.state ?? '',
        country: company.country ?? '',
        timezone: company.timezone ?? '',
        currency: company.currency ?? '',
    };
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

const getStatusStyles = (status) => {
    switch (String(status || '').toUpperCase()) {
        case 'APPROVED':
            return {
                label: 'Approved',
                className:
                    'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
                dot: 'bg-emerald-400',
            };

        case 'PENDING':
            return {
                label: 'Pending',
                className:
                    'border-amber-400/20 bg-amber-400/10 text-amber-300',
                dot: 'bg-amber-400',
            };

        case 'SUSPENDED':
            return {
                label: 'Suspended',
                className:
                    'border-orange-400/20 bg-orange-400/10 text-orange-300',
                dot: 'bg-orange-400',
            };

        case 'REJECTED':
            return {
                label: 'Rejected',
                className:
                    'border-red-400/20 bg-red-400/10 text-red-300',
                dot: 'bg-red-400',
            };

        default:
            return {
                label: status || 'Unknown',
                className:
                    'border-white/10 bg-white/[0.04] text-slate-300',
                dot: 'bg-slate-400',
            };
    }
};


// ─────────────────────────────────────────────────────────────
// Reusable UI
// ─────────────────────────────────────────────────────────────

function Field({
    label,
    name,
    value,
    onChange,
    placeholder,
    type = 'text',
    icon: Icon,
    required = false,
    disabled = false,
    autoComplete,
}) {
    return (
        <div className="space-y-2">
            <label
                htmlFor={name}
                className="block text-sm font-medium text-slate-300"
            >
                {label}
                {required && (
                    <span className="ml-1 text-emerald-400">*</span>
                )}
            </label>

            <div className="relative">
                {Icon && (
                    <Icon
                        size={17}
                        strokeWidth={1.8}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                )}

                <input
                    id={name}
                    name={name}
                    type={type}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    required={required}
                    disabled={disabled}
                    autoComplete={autoComplete}
                    className={`
                        w-full rounded-xl border border-white/[0.08]
                        bg-white/[0.035] px-4 py-3
                        text-sm text-white
                        outline-none
                        placeholder:text-slate-600
                        transition-all
                        focus:border-emerald-400/40
                        focus:bg-white/[0.05]
                        focus:ring-2
                        focus:ring-emerald-400/10
                        disabled:cursor-not-allowed
                        disabled:opacity-50
                        ${Icon ? 'pl-11' : ''}
                    `}
                />
            </div>
        </div>
    );
}

function TextArea({
    label,
    name,
    value,
    onChange,
    placeholder,
    rows = 5,
}) {
    return (
        <div className="space-y-2">
            <label
                htmlFor={name}
                className="block text-sm font-medium text-slate-300"
            >
                {label}
            </label>

            <textarea
                id={name}
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                rows={rows}
                className="
                    w-full resize-none rounded-xl
                    border border-white/[0.08]
                    bg-white/[0.035]
                    px-4 py-3
                    text-sm text-white
                    outline-none
                    placeholder:text-slate-600
                    transition-all
                    focus:border-emerald-400/40
                    focus:bg-white/[0.05]
                    focus:ring-2
                    focus:ring-emerald-400/10
                "
            />
        </div>
    );
}

function SectionCard({
    icon: Icon,
    title,
    description,
    children,
}) {
    return (
        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
                <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/10 bg-emerald-400/[0.07]">
                        <Icon
                            size={18}
                            className="text-emerald-400"
                            strokeWidth={1.8}
                        />
                    </div>

                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-white">
                            {title}
                        </h2>

                        {description && (
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                                {description}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-5 sm:p-6">
                {children}
            </div>
        </section>
    );
}

function LoadingSkeleton() {
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
                <div className="mb-8 flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-xl bg-white/[0.05]" />

                    <div className="space-y-2">
                        <div className="h-5 w-36 animate-pulse rounded bg-white/[0.05]" />
                        <div className="h-3 w-52 animate-pulse rounded bg-white/[0.04]" />
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-6">
                        {[1, 2, 3].map((item) => (
                            <div
                                key={item}
                                className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6"
                            >
                                <div className="mb-6 h-5 w-40 animate-pulse rounded bg-white/[0.05]" />

                                <div className="grid gap-5 sm:grid-cols-2">
                                    <div className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />
                                    <div className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />
                                    <div className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />
                                    <div className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="h-[420px] animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.025]" />
                </div>
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function EditCompanyPage() {
    const params = useParams();
    const router = useRouter();

    const companyId = useMemo(() => {
        return Array.isArray(params?.id)
            ? params.id[0]
            : params?.id;
    }, [params?.id]);

    const [company, setCompany] = useState(null);
    const [companyUser, setCompanyUser] = useState(null);

    const [form, setForm] = useState({
        ...EMPTY_FORM,
    });

    const [originalForm, setOriginalForm] = useState({
        ...EMPTY_FORM,
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState('');
    const [saveError, setSaveError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [logoError, setLogoError] = useState(false);

    // ─────────────────────────────────────────────────────────
    // Load company
    // ─────────────────────────────────────────────────────────

    const loadCompany = useCallback(async () => {
        if (!companyId) {
            return;
        }

        if (!isValidObjectId(companyId)) {
            console.error(
                'Invalid company ID received from route:',
                companyId
            );

            setError(`Invalid company ID: ${companyId}`);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError('');
            setSaveError('');

            const response = await getAdminCompany(companyId);
            const parsed = getCompanyData(response);

            if (!parsed?.company) {
                throw new Error(
                    'Company information was not returned by the server.'
                );
            }

            const nextForm = normalizeCompanyForm(
                parsed.company
            );

            setCompany(parsed.company);
            setCompanyUser(parsed.companyUser || null);

            setForm(nextForm);
            setOriginalForm(nextForm);

            setLogoError(false);
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
        }
    }, [companyId]);

    useEffect(() => {
        if (!companyId) return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadCompany();
    }, [companyId, loadCompany]);

    // ─────────────────────────────────────────────────────────
    // Form changes
    // ─────────────────────────────────────────────────────────

    const handleChange = (event) => {
        const {
            name,
            value,
        } = event.target;

        setForm((current) => ({
            ...current,
            [name]: value,
        }));

        if (saveError) {
            setSaveError('');
        }

        if (successMessage) {
            setSuccessMessage('');
        }

        if (name === 'logo') {
            setLogoError(false);
        }
    };

    // ─────────────────────────────────────────────────────────
    // Unsaved state
    // ─────────────────────────────────────────────────────────

    const hasChanges = useMemo(() => {
        return Object.keys(EMPTY_FORM).some(
            (key) => form[key] !== originalForm[key]
        );
    }, [form, originalForm]);

    // ─────────────────────────────────────────────────────────
    // Save
    // ─────────────────────────────────────────────────────────

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!companyId || !isValidObjectId(companyId)) {
            setSaveError('Invalid company ID.');
            return;
        }

        if (!form.name.trim()) {
            setSaveError('Company name is required.');
            return;
        }

        if (!form.slug.trim()) {
            setSaveError('Company slug is required.');
            return;
        }

        if (!form.email.trim()) {
            setSaveError('Company email is required.');
            return;
        }

        const payload = {
            name: form.name.trim(),

            slug: form.slug
                .trim()
                .toLowerCase(),

            email: form.email
                .trim()
                .toLowerCase(),

            phone: form.phone.trim()
                ? form.phone.trim()
                : null,

            logo: form.logo.trim()
                ? form.logo.trim()
                : null,

            website: form.website.trim()
                ? form.website.trim()
                : null,

            description: form.description.trim()
                ? form.description.trim()
                : null,

            address: form.address.trim()
                ? form.address.trim()
                : null,

            city: form.city.trim()
                ? form.city.trim()
                : null,

            state: form.state.trim()
                ? form.state.trim()
                : null,

            country: form.country.trim()
                ? form.country.trim()
                : null,

            timezone: form.timezone.trim()
                ? form.timezone.trim()
                : null,

            currency: form.currency.trim()
                ? form.currency.trim().toUpperCase()
                : null,
        };

        try {
            setSaving(true);
            setSaveError('');
            setSuccessMessage('');

            await updateAdminCompany(
                companyId,
                payload
            );

            /*
             * Reload from the backend after saving.
             * We intentionally do not fake/update the UI locally.
             */
            const refreshedResponse =
                await getAdminCompany(companyId);

            const refreshed =
                getCompanyData(refreshedResponse);

            if (!refreshed?.company) {
                throw new Error(
                    'Company was updated, but the refreshed company data could not be loaded.'
                );
            }

            const refreshedForm =
                normalizeCompanyForm(
                    refreshed.company
                );

            setCompany(refreshed.company);
            setCompanyUser(
                refreshed.companyUser || null
            );

            setForm(refreshedForm);
            setOriginalForm(refreshedForm);

            setSuccessMessage(
                'Company information saved successfully.'
            );

            /*
             * Give the success state a moment so the user
             * can see confirmation before returning.
             */
            setTimeout(() => {
                router.push(
                    `/admin/users/companies/${companyId}`
                );
            }, 700);
        } catch (err) {
            console.error(
                'Failed to update company:',
                err
            );

            setSaveError(
                err?.message ||
                'Failed to update company.'
            );
        } finally {
            setSaving(false);
        }
    };

    // ─────────────────────────────────────────────────────────
    // Cancel
    // ─────────────────────────────────────────────────────────

    const handleCancel = () => {
        router.push(
            `/admin/users/companies/${companyId}`
        );
    };

    // ─────────────────────────────────────────────────────────
    // Invalid / missing ID
    // ─────────────────────────────────────────────────────────

    if (!companyId) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
                <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10">
                        <X
                            size={22}
                            className="text-red-400"
                        />
                    </div>

                    <h1 className="text-lg font-semibold">
                        Invalid Company
                    </h1>

                    <p className="mt-2 text-sm text-slate-500">
                        No company ID was provided in the route.
                    </p>

                    <button
                        type="button"
                        onClick={() =>
                            router.push(
                                '/admin/users/companies'
                            )
                        }
                        className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                    >
                        Back to Companies
                    </button>
                </div>
            </div>
        );
    }

    if (
        !isValidObjectId(companyId) &&
        !loading
    ) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
                <div className="w-full max-w-md rounded-2xl border border-red-400/10 bg-white/[0.025] p-6 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10">
                        <X
                            size={22}
                            className="text-red-400"
                        />
                    </div>

                    <h1 className="text-lg font-semibold">
                        Invalid Company ID
                    </h1>

                    <p className="mt-2 break-all text-sm text-slate-500">
                        {error ||
                            `The route contains an invalid company ID: ${companyId}`}
                    </p>

                    <button
                        type="button"
                        onClick={() =>
                            router.push(
                                '/admin/users/companies'
                            )
                        }
                        className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                    >
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
                    <div className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-center sm:p-8">
                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10">
                            <X
                                size={24}
                                className="text-red-400"
                            />
                        </div>

                        <h1 className="text-xl font-semibold">
                            Unable to load company
                        </h1>

                        <p className="mt-2 text-sm leading-6 text-slate-500">
                            {error}
                        </p>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                            <button
                                type="button"
                                onClick={loadCompany}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.07]"
                            >
                                Try Again
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        '/admin/users/companies'
                                    )
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                            >
                                Back to Companies
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const status =
        getStatusStyles(company?.status);

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <form onSubmit={handleSubmit}>
                <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">

                    {/* ───────────────────────────────────────────
                        Header
                    ─────────────────────────────────────────── */}

                    <header className="mb-7">
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

                            <div className="flex min-w-0 items-start gap-3">
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="
                                        mt-0.5 flex h-10 w-10
                                        shrink-0 items-center justify-center
                                        rounded-xl border border-white/[0.08]
                                        bg-white/[0.025]
                                        text-slate-400
                                        transition
                                        hover:border-white/[0.14]
                                        hover:bg-white/[0.05]
                                        hover:text-white
                                    "
                                    aria-label="Back to company profile"
                                >
                                    <ArrowLeft
                                        size={18}
                                        strokeWidth={1.8}
                                    />
                                </button>

                                <div className="min-w-0">
                                    <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
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

                                        <ChevronRight
                                            size={13}
                                        />

                                        <button
                                            type="button"
                                            onClick={handleCancel}
                                            className="transition hover:text-slate-300"
                                        >
                                            {company?.name ||
                                                'Company'}
                                        </button>

                                        <ChevronRight
                                            size={13}
                                        />

                                        <span className="text-slate-400">
                                            Edit
                                        </span>
                                    </div>

                                    <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
                                        Edit Company
                                    </h1>

                                    <p className="mt-1 max-w-2xl text-sm text-slate-500">
                                        Update the company information stored in Media Masters.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    disabled={saving}
                                    className="
                                        hidden rounded-xl
                                        border border-white/[0.08]
                                        bg-white/[0.025]
                                        px-4 py-2.5
                                        text-sm font-medium text-slate-300
                                        transition
                                        hover:bg-white/[0.05]
                                        hover:text-white
                                        disabled:cursor-not-allowed
                                        disabled:opacity-50
                                        sm:inline-flex
                                    "
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={saving || !hasChanges}
                                    className="
                                        inline-flex items-center
                                        justify-center gap-2
                                        rounded-xl
                                        bg-emerald-400
                                        px-4 py-2.5
                                        text-sm font-semibold
                                        text-slate-950
                                        shadow-lg
                                        shadow-emerald-500/10
                                        transition
                                        hover:bg-emerald-300
                                        disabled:cursor-not-allowed
                                        disabled:opacity-40
                                    "
                                >
                                    {saving ? (
                                        <>
                                            <Loader2
                                                size={17}
                                                className="animate-spin"
                                            />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save
                                                size={17}
                                                strokeWidth={2}
                                            />
                                            Save Changes
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </header>


                    {/* ───────────────────────────────────────────
                        Save messages
                    ─────────────────────────────────────────── */}

                    {saveError && (
                        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-400/15 bg-red-400/[0.06] px-4 py-3.5">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-400/10">
                                <X
                                    size={15}
                                    className="text-red-400"
                                />
                            </div>

                            <div className="min-w-0">
                                <p className="text-sm font-medium text-red-300">
                                    Unable to save changes
                                </p>

                                <p className="mt-0.5 text-xs leading-5 text-red-300/70">
                                    {saveError}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setSaveError('')
                                }
                                className="ml-auto shrink-0 p-1 text-red-400/60 transition hover:text-red-300"
                                aria-label="Dismiss error"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {successMessage && (
                        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-3.5">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10">
                                <Check
                                    size={15}
                                    className="text-emerald-400"
                                />
                            </div>

                            <p className="text-sm font-medium text-emerald-300">
                                {successMessage}
                            </p>
                        </div>
                    )}


                    {/* ───────────────────────────────────────────
                        Main layout
                    ─────────────────────────────────────────── */}

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">

                        {/* Main form */}
                        <main className="min-w-0 space-y-6">

                            {/* Business information */}
                            <SectionCard
                                icon={Building2}
                                title="Business Information"
                                description="Core information used to identify the company."
                            >
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field
                                        label="Company Name"
                                        name="name"
                                        value={form.name}
                                        onChange={handleChange}
                                        placeholder="Company name"
                                        icon={Building2}
                                        required
                                        autoComplete="organization"
                                    />

                                    <Field
                                        label="Company Slug"
                                        name="slug"
                                        value={form.slug}
                                        onChange={handleChange}
                                        placeholder="company-slug"
                                        required
                                    />

                                    <Field
                                        label="Company Email"
                                        name="email"
                                        value={form.email}
                                        onChange={handleChange}
                                        placeholder="company@example.com"
                                        type="email"
                                        icon={Mail}
                                        required
                                        autoComplete="email"
                                    />

                                    <Field
                                        label="Phone"
                                        name="phone"
                                        value={form.phone}
                                        onChange={handleChange}
                                        placeholder="+234..."
                                        type="tel"
                                        icon={Phone}
                                        autoComplete="tel"
                                    />

                                    <div className="sm:col-span-2">
                                        <Field
                                            label="Website"
                                            name="website"
                                            value={form.website}
                                            onChange={handleChange}
                                            placeholder="https://example.com"
                                            type="url"
                                            icon={Globe}
                                            autoComplete="url"
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <TextArea
                                            label="Description"
                                            name="description"
                                            value={form.description}
                                            onChange={handleChange}
                                            placeholder="Describe the company..."
                                            rows={5}
                                        />
                                    </div>
                                </div>
                            </SectionCard>


                            {/* Location */}
                            <SectionCard
                                icon={MapPin}
                                title="Location"
                                description="Company address and geographical information."
                            >
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <TextArea
                                            label="Address"
                                            name="address"
                                            value={form.address}
                                            onChange={handleChange}
                                            placeholder="Company street address"
                                            rows={3}
                                        />
                                    </div>

                                    <Field
                                        label="City"
                                        name="city"
                                        value={form.city}
                                        onChange={handleChange}
                                        placeholder="City"
                                    />

                                    <Field
                                        label="State"
                                        name="state"
                                        value={form.state}
                                        onChange={handleChange}
                                        placeholder="State"
                                    />

                                    <Field
                                        label="Country"
                                        name="country"
                                        value={form.country}
                                        onChange={handleChange}
                                        placeholder="Country"
                                    />
                                </div>
                            </SectionCard>


                            {/* Regional settings */}
                            <SectionCard
                                icon={Globe}
                                title="Regional Settings"
                                description="Timezone and currency stored for this company."
                            >
                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field
                                        label="Timezone"
                                        name="timezone"
                                        value={form.timezone}
                                        onChange={handleChange}
                                        placeholder="Africa/Lagos"
                                    />

                                    <Field
                                        label="Currency"
                                        name="currency"
                                        value={form.currency}
                                        onChange={handleChange}
                                        placeholder="NGN"
                                    />
                                </div>
                            </SectionCard>


                            {/* Mobile actions */}
                            <div className="flex gap-3 sm:hidden">
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    disabled={saving}
                                    className="
                                        flex-1 rounded-xl
                                        border border-white/[0.08]
                                        bg-white/[0.025]
                                        px-4 py-3
                                        text-sm font-medium text-slate-300
                                        transition
                                        hover:bg-white/[0.05]
                                        disabled:opacity-50
                                    "
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={
                                        saving ||
                                        !hasChanges
                                    }
                                    className="
                                        flex flex-1 items-center
                                        justify-center gap-2
                                        rounded-xl
                                        bg-emerald-400
                                        px-4 py-3
                                        text-sm font-semibold
                                        text-slate-950
                                        transition
                                        hover:bg-emerald-300
                                        disabled:opacity-40
                                    "
                                >
                                    {saving ? (
                                        <>
                                            <Loader2
                                                size={17}
                                                className="animate-spin"
                                            />
                                            Saving
                                        </>
                                    ) : (
                                        <>
                                            <Save
                                                size={17}
                                            />
                                            Save
                                        </>
                                    )}
                                </button>
                            </div>
                        </main>


                        {/* ─────────────────────────────────────────
                            Sidebar
                        ───────────────────────────────────────── */}

                        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">

                            {/* Company identity */}
                            <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
                                <div className="border-b border-white/[0.06] px-5 py-4">
                                    <div className="flex items-center gap-2">
                                        <Sparkles
                                            size={16}
                                            className="text-emerald-400"
                                        />

                                        <h2 className="text-sm font-semibold text-white">
                                            Company Identity
                                        </h2>
                                    </div>
                                </div>

                                <div className="p-5">
                                    <div className="flex flex-col items-center text-center">
                                        <div className="relative mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.04]">
                                            {form.logo &&
                                            !logoError ? (
                                                <img
                                                    src={form.logo}
                                                    alt={
                                                        form.name ||
                                                        'Company logo'
                                                    }
                                                    className="h-full w-full object-cover"
                                                    onError={() =>
                                                        setLogoError(
                                                            true
                                                        )
                                                    }
                                                />
                                            ) : (
                                                <>
                                                    {form.logo &&
                                                    logoError ? (
                                                        <ImageIcon
                                                            size={28}
                                                            className="text-slate-600"
                                                        />
                                                    ) : (
                                                        <span className="text-2xl font-semibold text-emerald-400">
                                                            {form.name
                                                                ?.trim()
                                                                ?.charAt(
                                                                    0
                                                                )
                                                                ?.toUpperCase() ||
                                                                'C'}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        <p className="max-w-full truncate text-sm font-semibold text-white">
                                            {form.name ||
                                                'Company'}
                                        </p>

                                        <p className="mt-1 max-w-full truncate text-xs text-slate-500">
                                            {form.email ||
                                                'No email'}
                                        </p>
                                    </div>

                                    <div className="mt-5">
                                        <Field
                                            label="Logo URL"
                                            name="logo"
                                            value={form.logo}
                                            onChange={handleChange}
                                            placeholder="https://..."
                                            type="url"
                                        />

                                        <p className="mt-2 text-[11px] leading-5 text-slate-600">
                                            Enter the image URL stored for the company logo. No file upload is performed here.
                                        </p>
                                    </div>
                                </div>
                            </section>


                            {/* Account status */}
                            <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
                                <div className="border-b border-white/[0.06] px-5 py-4">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck
                                            size={16}
                                            className="text-emerald-400"
                                        />

                                        <h2 className="text-sm font-semibold text-white">
                                            Account Status
                                        </h2>
                                    </div>
                                </div>

                                <div className="p-5">
                                    <div
                                        className={`
                                            inline-flex items-center gap-2
                                            rounded-full border px-3 py-1.5
                                            text-xs font-medium
                                            ${status.className}
                                        `}
                                    >
                                        <span
                                            className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                                        />

                                        {status.label}
                                    </div>

                                    <p className="mt-3 text-xs leading-5 text-slate-500">
                                        Company verification and account status are managed from the Company Profile page.
                                    </p>

                                    <button
                                        type="button"
                                        onClick={handleCancel}
                                        className="
                                            mt-4 inline-flex
                                            items-center gap-1.5
                                            text-xs font-medium
                                            text-emerald-400
                                            transition
                                            hover:text-emerald-300
                                        "
                                    >
                                        Manage status
                                        <ChevronRight
                                            size={13}
                                        />
                                    </button>
                                </div>
                            </section>


                            {/* Login account */}
                            <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
                                <div className="border-b border-white/[0.06] px-5 py-4">
                                    <div className="flex items-center gap-2">
                                        <Mail
                                            size={16}
                                            className="text-emerald-400"
                                        />

                                        <h2 className="text-sm font-semibold text-white">
                                            Login Account
                                        </h2>
                                    </div>
                                </div>

                                <div className="p-5">
                                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-600">
                                        Company login email
                                    </p>

                                    <p className="mt-2 break-all text-sm text-slate-300">
                                        {companyUser?.email ||
                                            company?.email ||
                                            '—'}
                                    </p>

                                    <p className="mt-3 text-xs leading-5 text-slate-600">
                                        Saving the company email updates the company login email through the backend.
                                    </p>
                                </div>
                            </section>


                            {/* Backend metadata */}
                            <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]">
                                <div className="border-b border-white/[0.06] px-5 py-4">
                                    <h2 className="text-sm font-semibold text-white">
                                        Company Metadata
                                    </h2>
                                </div>

                                <div className="divide-y divide-white/[0.05]">
                                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                                        <span className="text-xs text-slate-500">
                                            Created
                                        </span>

                                        <span className="text-right text-xs text-slate-300">
                                            {formatDate(
                                                company?.createdAt
                                            )}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                                        <span className="text-xs text-slate-500">
                                            Updated
                                        </span>

                                        <span className="text-right text-xs text-slate-300">
                                            {formatDate(
                                                company?.updatedAt
                                            )}
                                        </span>
                                    </div>

                                    <div className="px-5 py-4">
                                        <span className="text-xs text-slate-500">
                                            Company ID
                                        </span>

                                        <p className="mt-2 break-all font-mono text-[11px] text-slate-600">
                                            {company?._id ||
                                                company?.id ||
                                                companyId}
                                        </p>
                                    </div>
                                </div>
                            </section>


                            {/* Unsaved state */}
                            {hasChanges && (
                                <div className="rounded-2xl border border-amber-400/10 bg-amber-400/[0.04] p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />

                                        <div>
                                            <p className="text-xs font-medium text-amber-300">
                                                Unsaved changes
                                            </p>

                                            <p className="mt-1 text-[11px] leading-5 text-amber-300/60">
                                                Save your changes before leaving this page.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </aside>
                    </div>
                </div>
            </form>
        </div>
    );
}