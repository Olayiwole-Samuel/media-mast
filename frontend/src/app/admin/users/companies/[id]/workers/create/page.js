'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Building2,
    Check,
    CheckCircle2,
    ChevronDown,
    CircleAlert,
    Loader2,
    Mail,
    Phone,
    ShieldCheck,
    UserPlus,
    Users,
    X,
} from 'lucide-react';

import {
    getAdminCompany,
    createAdminCompanyWorker,
} from '@/lib/api';
import { PASSWORD_HINT, passwordProblem } from '@/lib/passwordRules';

const INITIAL_FORM = {
    name: '',
    email: '',
    phone: '',
    position: '',
    departmentId: '',
    password: '',
};

const DEFAULT_POSITIONS = [
    'Team Member',
    'Campaign Manager',
    'Media Buyer',
    'Account Manager',
    'Finance Manager',
    'Marketing Manager',
    'Administrator',
];

function normalizeResponse(response) {
    return (
        response?.data?.company ||
        response?.data ||
        response?.company ||
        response
    );
}

function getErrorMessage(error) {
    if (!error) return 'Something went wrong. Please try again.';

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

function FieldLabel({ children, required = false }) {
    return (
        <label className="mb-2 block text-[13px] font-medium text-slate-300">
            {children}
            {required && (
                <span className="ml-1 text-emerald-400">*</span>
            )}
        </label>
    );
}

function InputField({
    label,
    name,
    value,
    onChange,
    placeholder,
    type = 'text',
    icon: Icon,
    required = false,
    disabled = false,
    error,
    autoComplete,
}) {
    return (
        <div>
            <FieldLabel required={required}>{label}</FieldLabel>

            <div className="relative">
                {Icon && (
                    <Icon
                        size={17}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"
                    />
                )}

                <input
                    type={type}
                    name={name}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete={autoComplete}
                    className={`
                        w-full rounded-xl border
                        bg-slate-950
                        px-4 py-3
                        text-sm text-white
                        outline-none
                        placeholder:text-slate-700
                        transition
                        ${
                            Icon
                                ? 'pl-10'
                                : ''
                        }
                        ${
                            error
                                ? 'border-red-500/40 focus:border-red-500/60'
                                : 'border-white/[0.08] focus:border-emerald-500/50'
                        }
                        disabled:cursor-not-allowed
                        disabled:opacity-50
                    `}
                />
            </div>

            {error && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
                    <CircleAlert size={13} />
                    {error}
                </p>
            )}
        </div>
    );
}

function SelectField({
    label,
    name,
    value,
    onChange,
    options,
    placeholder,
    required = false,
    disabled = false,
    error,
}) {
    return (
        <div>
            <FieldLabel required={required}>{label}</FieldLabel>

            <div className="relative">
                <select
                    name={name}
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    className={`
                        w-full
                        appearance-none
                        rounded-xl
                        border
                        bg-slate-950
                        px-4
                        py-3
                        pr-10
                        text-sm
                        text-white
                        outline-none
                        transition
                        ${
                            value
                                ? 'text-white'
                                : 'text-slate-600'
                        }
                        ${
                            error
                                ? 'border-red-500/40 focus:border-red-500/60'
                                : 'border-white/[0.08] focus:border-emerald-500/50'
                        }
                        disabled:cursor-not-allowed
                        disabled:opacity-50
                    `}
                >
                    <option value="" disabled>
                        {placeholder}
                    </option>

                    {options.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                            className="bg-slate-900 text-white"
                        >
                            {option.label}
                        </option>
                    ))}
                </select>

                <ChevronDown
                    size={17}
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600"
                />
            </div>

            {error && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
                    <CircleAlert size={13} />
                    {error}
                </p>
            )}
        </div>
    );
}

export default function CreateCompanyWorkerPage() {
    const router = useRouter();
    const params = useParams();

    const companyId = params?.id;

    const [company, setCompany] = useState(null);
    const [departments, setDepartments] = useState([]);

    const [form, setForm] = useState(INITIAL_FORM);
    const [errors, setErrors] = useState({});

    const [loadingCompany, setLoadingCompany] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [pageError, setPageError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (!companyId) return;

        let cancelled = false;

        const loadCompany = async () => {
            try {
                setLoadingCompany(true);
                setPageError('');

                const response = await getAdminCompany(companyId);

                if (cancelled) return;

                const companyData = normalizeResponse(response);

                if (!companyData?._id) {
                    throw new Error(
                        'Company information could not be loaded.'
                    );
                }

                setCompany(companyData);

                /*
                 * Departments are read defensively because the current
                 * company endpoint may or may not expose them depending
                 * on the backend response shape.
                 */
                const departmentData =
                    response?.data?.departments ||
                    companyData?.departments ||
                    [];

                if (Array.isArray(departmentData)) {
                    setDepartments(departmentData);
                }
            } catch (error) {
                if (cancelled) return;

                console.error(
                    'Failed to load company:',
                    error
                );

                setPageError(
                    getErrorMessage(error)
                );
            } finally {
                if (!cancelled) {
                    setLoadingCompany(false);
                }
            }
        };

        loadCompany();

        return () => {
            cancelled = true;
        };
    }, [companyId]);

    const positionOptions = useMemo(() => {
        const positions = [
            ...DEFAULT_POSITIONS,
        ];

        /*
         * If the backend already provides company-specific
         * positions, preserve them without duplicating values.
         */
        if (Array.isArray(company?.positions)) {
            for (const position of company.positions) {
                const value =
                    typeof position === 'string'
                        ? position
                        : position?.name;

                if (
                    value &&
                    !positions.includes(value)
                ) {
                    positions.push(value);
                }
            }
        }

        return positions.map((position) => ({
            value: position,
            label: position,
        }));
    }, [company]);

    const departmentOptions = useMemo(() => {
        return departments
            .map((department) => {
                const id =
                    department?._id ||
                    department?.id;

                const name =
                    department?.name ||
                    department?.title;

                if (!id || !name) {
                    return null;
                }

                return {
                    value: id,
                    label: name,
                };
            })
            .filter(Boolean);
    }, [departments]);

    const handleChange = (event) => {
        const {
            name,
            value,
        } = event.target;

        setForm((current) => ({
            ...current,
            [name]: value,
        }));

        setErrors((current) => {
            if (!current[name]) return current;

            const next = {
                ...current,
            };

            delete next[name];

            return next;
        });

        setPageError('');
    };

    const validate = () => {
        const nextErrors = {};

        const name = form.name.trim();
        const email = form.email.trim().toLowerCase();
        const phone = form.phone.trim();
        const position = form.position.trim();
        const password = form.password;

        if (!name) {
            nextErrors.name =
                'Full name is required.';
        } else if (name.length < 2) {
            nextErrors.name =
                'Name must be at least 2 characters.';
        }

        if (!email) {
            nextErrors.email =
                'Email address is required.';
        } else if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                email
            )
        ) {
            nextErrors.email =
                'Enter a valid email address.';
        }

        if (phone) {
            const normalizedPhone =
                phone.replace(
                    /[\s\-().]/g,
                    ''
                );

            if (
                !/^\+?[0-9]{7,15}$/.test(
                    normalizedPhone
                )
            ) {
                nextErrors.phone =
                    'Enter a valid phone number.';
            }
        }

        if (!position) {
            nextErrors.position =
                'Position is required.';
        }

        if (!password) {
            nextErrors.password =
                'Temporary password is required.';
        } else if (passwordProblem(password)) {
            // Same rule as the server (the worker replaces it on first sign-in).
            nextErrors.password =
                `${passwordProblem(password)}.`;
        }

        setErrors(nextErrors);

        return (
            Object.keys(nextErrors).length === 0
        );
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (submitting) return;

        setSuccessMessage('');
        setPageError('');

        if (!validate()) {
            return;
        }

        try {
            setSubmitting(true);

            const payload = {
                name: form.name.trim(),
                email: form.email
                    .trim()
                    .toLowerCase(),
                password: form.password,
                position: form.position.trim(),
            };

            /*
             * Only send optional values when the admin actually
             * entered them. This avoids sending empty strings to
             * the backend.
             */
            if (form.phone.trim()) {
                payload.phone =
                    form.phone.trim();
            }

            if (form.departmentId) {
                payload.departmentId =
                    form.departmentId;
            }

            await createAdminCompanyWorker(
                companyId,
                payload
            );

            setSuccessMessage(
                'Worker created successfully.'
            );

            setForm(INITIAL_FORM);
            setErrors({});

            /*
             * Give the success state a moment to render,
             * then return to the worker list.
             */
            setTimeout(() => {
                router.push(
                    `/admin/users/companies/${companyId}/workers`
                );
            }, 900);
        } catch (error) {
            console.error(
                'Failed to create company worker:',
                error
            );

            const message =
                getErrorMessage(error);

            const lowerMessage =
                message.toLowerCase();

            if (
                lowerMessage.includes(
                    'email'
                ) &&
                (
                    lowerMessage.includes(
                        'exist'
                    ) ||
                    lowerMessage.includes(
                        'duplicate'
                    ) ||
                    lowerMessage.includes(
                        'already'
                    )
                )
            ) {
                setErrors({
                    email: message,
                });
            } else {
                setPageError(message);
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingCompany) {
        return (
            <div className="min-h-screen bg-slate-950 text-white">
                <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
                    <div className="mb-8 flex items-center gap-3">
                        <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-900" />

                        <div className="space-y-2">
                            <div className="h-4 w-32 animate-pulse rounded bg-slate-900" />
                            <div className="h-3 w-56 animate-pulse rounded bg-slate-900" />
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-slate-900/50">
                        <div className="border-b border-white/[0.06] p-6">
                            <div className="h-6 w-48 animate-pulse rounded bg-slate-800" />
                            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-slate-800" />
                        </div>

                        <div className="grid gap-5 p-6 sm:grid-cols-2">
                            {Array.from({
                                length: 6,
                            }).map((_, index) => (
                                <div
                                    key={index}
                                    className="space-y-2"
                                >
                                    <div className="h-3 w-24 animate-pulse rounded bg-slate-800" />
                                    <div className="h-11 w-full animate-pulse rounded-xl bg-slate-950" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (pageError && !company) {
        return (
            <div className="min-h-screen bg-slate-950 text-white">
                <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                    <Link
                        href="/admin/users/companies"
                        className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
                    >
                        <ArrowLeft size={16} />
                        Back to Companies
                    </Link>

                    <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-6">
                        <div className="flex items-start gap-3">
                            <CircleAlert
                                size={20}
                                className="mt-0.5 shrink-0 text-red-400"
                            />

                            <div>
                                <h1 className="font-semibold text-white">
                                    Unable to load company
                                </h1>

                                <p className="mt-1 text-sm text-red-300/80">
                                    {pageError}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                window.location.reload()
                            }
                            className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.07]"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

                {/* Header */}
                <div className="mb-7">
                    <Link
                        href={`/admin/users/companies/${companyId}/workers`}
                        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-white"
                    >
                        <ArrowLeft size={16} />
                        Back to Workers
                    </Link>

                    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                        <div>
                            <div className="mb-3 flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06]">
                                    <UserPlus
                                        size={17}
                                        className="text-emerald-400"
                                    />
                                </div>

                                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
                                    Company Worker
                                </span>
                            </div>

                            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                                Create Worker
                            </h1>

                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                                Add a new team member to{' '}
                                <span className="font-medium text-slate-300">
                                    {company?.name ||
                                        'this company'}
                                </span>
                                .
                            </p>
                        </div>

                        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-slate-900/70 px-3.5 py-2.5">
                            <Building2
                                size={16}
                                className="text-slate-500"
                            />

                            <div className="min-w-0">
                                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600">
                                    Company
                                </p>

                                <p className="max-w-[180px] truncate text-xs font-medium text-slate-300">
                                    {company?.name}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <form
                    onSubmit={handleSubmit}
                    noValidate
                >
                    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-900/60 shadow-2xl shadow-black/10">

                        {/* Form heading */}
                        <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
                            <div className="flex items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04]">
                                    <Users
                                        size={17}
                                        className="text-slate-400"
                                    />
                                </div>

                                <div>
                                    <h2 className="text-sm font-semibold text-white">
                                        Worker Information
                                    </h2>

                                    <p className="mt-1 text-xs leading-5 text-slate-600">
                                        Enter the worker&apos;s account and
                                        employment details.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 sm:p-6">

                            {/* Error */}
                            {pageError && (
                                <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3.5">
                                    <CircleAlert
                                        size={17}
                                        className="mt-0.5 shrink-0 text-red-400"
                                    />

                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-red-300">
                                            Could not create worker
                                        </p>

                                        <p className="mt-1 text-xs leading-5 text-red-300/70">
                                            {pageError}
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setPageError('')
                                        }
                                        className="text-red-400/60 transition hover:text-red-300"
                                        aria-label="Dismiss error"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {/* Success */}
                            {successMessage && (
                                <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3.5">
                                    <CheckCircle2
                                        size={18}
                                        className="shrink-0 text-emerald-400"
                                    />

                                    <div>
                                        <p className="text-sm font-medium text-emerald-300">
                                            {successMessage}
                                        </p>

                                        <p className="mt-0.5 text-xs text-emerald-300/60">
                                            Redirecting to the worker list…
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-5 sm:grid-cols-2">

                                {/* Name */}
                                <InputField
                                    label="Full Name"
                                    name="name"
                                    value={form.name}
                                    onChange={handleChange}
                                    placeholder="e.g. Samuel Johnson"
                                    icon={Users}
                                    required
                                    disabled={submitting}
                                    error={errors.name}
                                    autoComplete="name"
                                />

                                {/* Email */}
                                <InputField
                                    label="Email Address"
                                    name="email"
                                    value={form.email}
                                    onChange={handleChange}
                                    placeholder="worker@company.com"
                                    type="email"
                                    icon={Mail}
                                    required
                                    disabled={submitting}
                                    error={errors.email}
                                    autoComplete="email"
                                />

                                {/* Phone */}
                                <InputField
                                    label="Phone Number"
                                    name="phone"
                                    value={form.phone}
                                    onChange={handleChange}
                                    placeholder="+234 800 000 0000"
                                    type="tel"
                                    icon={Phone}
                                    disabled={submitting}
                                    error={errors.phone}
                                    autoComplete="tel"
                                />

                                {/* Position */}
                                <SelectField
                                    label="Position"
                                    name="position"
                                    value={form.position}
                                    onChange={handleChange}
                                    options={positionOptions}
                                    placeholder="Select position"
                                    required
                                    disabled={submitting}
                                    error={errors.position}
                                />

                                {/* Department */}
                                <SelectField
                                    label="Department"
                                    name="departmentId"
                                    value={form.departmentId}
                                    onChange={handleChange}
                                    options={departmentOptions}
                                    placeholder={
                                        departmentOptions.length
                                            ? 'Select department'
                                            : 'No departments available'
                                    }
                                    disabled={
                                        submitting ||
                                        !departmentOptions.length
                                    }
                                    error={errors.departmentId}
                                />

                                {/* Password */}
                                <InputField
                                    label="Temporary Password"
                                    name="password"
                                    value={form.password}
                                    onChange={handleChange}
                                    placeholder="e.g. Temp-Pass-2026"
                                    type="password"
                                    icon={ShieldCheck}
                                    required
                                    disabled={submitting}
                                    error={errors.password}
                                    autoComplete="new-password"
                                />
                            </div>

                            {/* Password note */}
                            <div className="mt-5 rounded-xl border border-white/[0.05] bg-slate-950/60 px-4 py-3.5">
                                <div className="flex items-start gap-3">
                                    <ShieldCheck
                                        size={16}
                                        className="mt-0.5 shrink-0 text-slate-600"
                                    />

                                    <div>
                                        <p className="text-xs font-medium text-slate-400">
                                            Temporary password
                                        </p>

                                        <p className="mt-1 text-xs leading-5 text-slate-600">
                                            {PASSWORD_HINT} The worker signs in
                                            with it once and is then asked to
                                            choose their own password. Share it
                                            with them privately.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                            <Link
                                href={`/admin/users/companies/${companyId}/workers`}
                                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 text-sm font-medium text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                            >
                                Cancel
                            </Link>

                            <button
                                type="submit"
                                disabled={
                                    submitting ||
                                    Boolean(
                                        successMessage
                                    )
                                }
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2
                                            size={17}
                                            className="animate-spin"
                                        />
                                        Creating Worker…
                                    </>
                                ) : successMessage ? (
                                    <>
                                        <Check size={17} />
                                        Created
                                    </>
                                ) : (
                                    <>
                                        <UserPlus size={17} />
                                        Create Worker
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>

                {/* Bottom information */}
                <div className="mt-5 flex items-start gap-3 px-1">
                    <ShieldCheck
                        size={15}
                        className="mt-0.5 shrink-0 text-slate-700"
                    />

                    <p className="text-xs leading-5 text-slate-600">
                        This account will be created under{' '}
                        <span className="text-slate-500">
                            {company?.name}
                        </span>
                        . The worker will use their email and password to
                        access the company workspace according to their
                        assigned permissions.
                    </p>
                </div>
            </div>
        </div>
    );
}