'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Building2,
    Globe,
    Mail,
    Phone,
    MapPin,
    FileText,
    Clock3,
    Coins,
    LockKeyhole,
    CheckCircle2,
    AlertCircle,
    Loader2,
} from 'lucide-react';

import { createAdminCompany } from '@/lib/api';

const STATES = [
    'Abia',
    'Adamawa',
    'Akwa Ibom',
    'Anambra',
    'Bauchi',
    'Bayelsa',
    'Benue',
    'Borno',
    'Cross River',
    'Delta',
    'Ebonyi',
    'Edo',
    'Ekiti',
    'Enugu',
    'Gombe',
    'Imo',
    'Jigawa',
    'Kaduna',
    'Kano',
    'Katsina',
    'Kebbi',
    'Kogi',
    'Kwara',
    'Lagos',
    'Nasarawa',
    'Niger',
    'Ogun',
    'Ondo',
    'Osun',
    'Oyo',
    'Plateau',
    'Rivers',
    'Sokoto',
    'Taraba',
    'Yobe',
    'Zamfara',
    'Federal Capital Territory',
];

const inputClass = `
    w-full rounded-xl
    border border-white/[0.08]
    bg-slate-900
    px-3.5 py-3
    text-sm text-white
    placeholder:text-slate-600
    outline-none
    transition
    focus:border-emerald-400/30
    focus:ring-2
    focus:ring-emerald-400/10
    disabled:cursor-not-allowed
    disabled:opacity-50
`;

const labelClass = `
    mb-2 block
    text-xs font-medium
    text-slate-400
`;

export default function CreateCompanyPage() {
    const router = useRouter();

    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        phone: '',
        website: '',
        description: '',
        address: '',
        city: '',
        state: '',
        country: 'Nigeria',
        timezone: 'Africa/Lagos',
        currency: 'NGN',
    });

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const updateField = (field, value) => {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const validateForm = () => {
        if (!form.email.trim()) {
            return 'Company email is required.';
        }

        const emailRegex = /^\S+@\S+\.\S+$/;

        if (!emailRegex.test(form.email.trim())) {
            return 'Please enter a valid company email.';
        }

        if (!form.password) {
            return 'Company password is required.';
        }

        if (form.password.length < 8) {
            return 'Company password must be at least 8 characters.';
        }

        if (!form.country.trim()) {
            return 'Country is required.';
        }

        return null;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        setError('');
        setSuccess('');

        const validationError = validateForm();

        if (validationError) {
            setError(validationError);
            return;
        }

        setSaving(true);

        try {
            const payload = {
                name: form.name.trim(),
                email: form.email.trim().toLowerCase(),
                password: form.password,
                phone: form.phone.trim() || null,
                website: form.website.trim() || null,
                description: form.description.trim() || null,
                address: form.address.trim() || null,
                city: form.city.trim() || null,
                state: form.state || null,
                country: form.country.trim(),
                timezone: form.timezone,
                currency: form.currency,
            };

            const response = await createAdminCompany(payload);

            setSuccess(
                response?.message ||
                'Company created successfully.'
            );

            setTimeout(() => {
                router.push('/admin/users/companies');
            }, 1000);
        } catch (err) {
            setError(
                err?.message ||
                'Failed to create company. Please try again.'
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">

                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/admin/users/companies"
                        className="
                            mb-5 inline-flex items-center gap-2
                            text-sm text-slate-500
                            transition hover:text-slate-300
                        "
                    >
                        <ArrowLeft size={16} />
                        Back to Companies
                    </Link>

                    <div className="flex items-start gap-4">
                        <div
                            className="
                                flex h-12 w-12 shrink-0
                                items-center justify-center
                                rounded-2xl
                                border border-emerald-400/10
                                bg-emerald-400/[0.07]
                                text-emerald-400
                            "
                        >
                            <Building2 size={23} />
                        </div>

                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">
                                Add Company
                            </h1>

                            <p className="mt-1 text-sm text-slate-500">
                                Create a new company account on Media Masters.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Alerts */}
                {error && (
                    <div
                        className="
                            mb-6 flex items-start gap-3
                            rounded-xl
                            border border-red-400/10
                            bg-red-400/[0.05]
                            px-4 py-3.5
                        "
                    >
                        <AlertCircle
                            size={18}
                            className="mt-0.5 shrink-0 text-red-400"
                        />

                        <p className="text-sm text-red-300">
                            {error}
                        </p>
                    </div>
                )}

                {success && (
                    <div
                        className="
                            mb-6 flex items-start gap-3
                            rounded-xl
                            border border-emerald-400/10
                            bg-emerald-400/[0.05]
                            px-4 py-3.5
                        "
                    >
                        <CheckCircle2
                            size={18}
                            className="mt-0.5 shrink-0 text-emerald-400"
                        />

                        <p className="text-sm text-emerald-300">
                            {success}
                        </p>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="space-y-6">

                        {/* Basic Information */}
                        <section
                            className="
                                rounded-2xl
                                border border-white/[0.07]
                                bg-slate-900/60
                            "
                        >
                            <div
                                className="
                                    border-b border-white/[0.06]
                                    px-5 py-4
                                    sm:px-6
                                "
                            >
                                <div className="flex items-center gap-3">
                                    <Building2
                                        size={18}
                                        className="text-emerald-400"
                                    />

                                    <div>
                                        <h2 className="text-sm font-semibold text-white">
                                            Basic Information
                                        </h2>

                                        <p className="mt-0.5 text-xs text-slate-500">
                                            Core information about the company.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">

                                {/* Company Name */}
                                <div className="sm:col-span-2">
                                    <label className={labelClass}>
                                        Company Name
                                        <span className="ml-1 text-emerald-400">
                                            *
                                        </span>
                                    </label>

                                    <div className="relative">
                                        <Building2
                                            size={17}
                                            className="
                                                absolute left-3.5 top-1/2
                                                -translate-y-1/2
                                                text-slate-600
                                            "
                                        />

                                        <input
                                            type="text"
                                            value={form.name}
                                            onChange={(event) =>
                                                updateField(
                                                    'name',
                                                    event.target.value
                                                )
                                            }
                                            placeholder="e.g. Acme Media Group"
                                            disabled={saving}
                                            className={`${inputClass} pl-10`}
                                        />
                                    </div>
                                </div>

                                {/* Email */}
                                <div>
                                    <label className={labelClass}>
                                        Company Email
                                        <span className="ml-1 text-emerald-400">
                                            *
                                        </span>
                                    </label>

                                    <div className="relative">
                                        <Mail
                                            size={17}
                                            className="
                                                absolute left-3.5 top-1/2
                                                -translate-y-1/2
                                                text-slate-600
                                            "
                                        />

                                        <input
                                            type="email"
                                            value={form.email}
                                            onChange={(event) =>
                                                updateField(
                                                    'email',
                                                    event.target.value
                                                )
                                            }
                                            placeholder="company@example.com"
                                            disabled={saving}
                                            className={`${inputClass} pl-10`}
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div>
                                    <label className={labelClass}>
                                        Initial Password
                                        <span className="ml-1 text-emerald-400">
                                            *
                                        </span>
                                    </label>

                                    <div className="relative">
                                        <LockKeyhole
                                            size={17}
                                            className="
                absolute left-3.5 top-1/2
                -translate-y-1/2
                text-slate-600
            "
                                        />

                                        <input
                                            type="password"
                                            value={form.password}
                                            onChange={(event) =>
                                                updateField(
                                                    'password',
                                                    event.target.value
                                                )
                                            }
                                            placeholder="Minimum 8 characters"
                                            disabled={saving}
                                            className={`${inputClass} pl-10`}
                                        />
                                    </div>

                                    <p className="mt-2 text-[11px] text-slate-600">
                                        This will be used for the company&apos;s initial account login.
                                    </p>
                                </div>

                                {/* Phone */}
                                <div>
                                    <label className={labelClass}>
                                        Phone Number
                                    </label>

                                    <div className="relative">
                                        <Phone
                                            size={17}
                                            className="
                                                absolute left-3.5 top-1/2
                                                -translate-y-1/2
                                                text-slate-600
                                            "
                                        />

                                        <input
                                            type="tel"
                                            value={form.phone}
                                            onChange={(event) =>
                                                updateField(
                                                    'phone',
                                                    event.target.value
                                                )
                                            }
                                            placeholder="+234 800 000 0000"
                                            disabled={saving}
                                            className={`${inputClass} pl-10`}
                                        />
                                    </div>
                                </div>

                                {/* Website */}
                                <div>
                                    <label className={labelClass}>
                                        Website
                                    </label>

                                    <div className="relative">
                                        <Globe
                                            size={17}
                                            className="
                                                absolute left-3.5 top-1/2
                                                -translate-y-1/2
                                                text-slate-600
                                            "
                                        />

                                        <input
                                            type="url"
                                            value={form.website}
                                            onChange={(event) =>
                                                updateField(
                                                    'website',
                                                    event.target.value
                                                )
                                            }
                                            placeholder="https://example.com"
                                            disabled={saving}
                                            className={`${inputClass} pl-10`}
                                        />
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="sm:col-span-2">
                                    <label className={labelClass}>
                                        Description
                                    </label>

                                    <div className="relative">
                                        <FileText
                                            size={17}
                                            className="
                                                absolute left-3.5 top-3.5
                                                text-slate-600
                                            "
                                        />

                                        <textarea
                                            value={form.description}
                                            onChange={(event) =>
                                                updateField(
                                                    'description',
                                                    event.target.value
                                                )
                                            }
                                            placeholder="Brief description of the company..."
                                            rows={4}
                                            disabled={saving}
                                            className={`${inputClass} resize-none pl-10`}
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Location */}
                        <section
                            className="
                                rounded-2xl
                                border border-white/[0.07]
                                bg-slate-900/60
                            "
                        >
                            <div
                                className="
                                    border-b border-white/[0.06]
                                    px-5 py-4
                                    sm:px-6
                                "
                            >
                                <div className="flex items-center gap-3">
                                    <MapPin
                                        size={18}
                                        className="text-emerald-400"
                                    />

                                    <div>
                                        <h2 className="text-sm font-semibold text-white">
                                            Location
                                        </h2>

                                        <p className="mt-0.5 text-xs text-slate-500">
                                            Where the company is based.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">

                                {/* Address */}
                                <div className="sm:col-span-2">
                                    <label className={labelClass}>
                                        Address
                                    </label>

                                    <div className="relative">
                                        <MapPin
                                            size={17}
                                            className="
                                                absolute left-3.5 top-3.5
                                                text-slate-600
                                            "
                                        />

                                        <textarea
                                            value={form.address}
                                            onChange={(event) =>
                                                updateField(
                                                    'address',
                                                    event.target.value
                                                )
                                            }
                                            placeholder="Full company address"
                                            rows={3}
                                            disabled={saving}
                                            className={`${inputClass} resize-none pl-10`}
                                        />
                                    </div>
                                </div>

                                {/* City */}
                                <div>
                                    <label className={labelClass}>
                                        City
                                    </label>

                                    <input
                                        type="text"
                                        value={form.city}
                                        onChange={(event) =>
                                            updateField(
                                                'city',
                                                event.target.value
                                            )
                                        }
                                        placeholder="e.g. Lagos"
                                        disabled={saving}
                                        className={inputClass}
                                    />
                                </div>

                                {/* State */}
                                <div>
                                    <label className={labelClass}>
                                        State
                                    </label>

                                    <select
                                        value={form.state}
                                        onChange={(event) =>
                                            updateField(
                                                'state',
                                                event.target.value
                                            )
                                        }
                                        disabled={saving}
                                        className={inputClass}
                                    >
                                        <option value="">
                                            Select state
                                        </option>

                                        {STATES.map((state) => (
                                            <option
                                                key={state}
                                                value={state}
                                            >
                                                {state}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Country */}
                                <div>
                                    <label className={labelClass}>
                                        Country
                                    </label>

                                    <input
                                        type="text"
                                        value={form.country}
                                        onChange={(event) =>
                                            updateField(
                                                'country',
                                                event.target.value
                                            )
                                        }
                                        disabled={saving}
                                        className={inputClass}
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Regional Settings */}
                        <section
                            className="
                                rounded-2xl
                                border border-white/[0.07]
                                bg-slate-900/60
                            "
                        >
                            <div
                                className="
                                    border-b border-white/[0.06]
                                    px-5 py-4
                                    sm:px-6
                                "
                            >
                                <div className="flex items-center gap-3">
                                    <Clock3
                                        size={18}
                                        className="text-emerald-400"
                                    />

                                    <div>
                                        <h2 className="text-sm font-semibold text-white">
                                            Regional Settings
                                        </h2>

                                        <p className="mt-0.5 text-xs text-slate-500">
                                            Currency and timezone used by the company.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">

                                {/* Currency */}
                                <div>
                                    <label className={labelClass}>
                                        Currency
                                    </label>

                                    <div className="relative">
                                        <Coins
                                            size={17}
                                            className="
                                                absolute left-3.5 top-1/2
                                                -translate-y-1/2
                                                text-slate-600
                                            "
                                        />

                                        <select
                                            value={form.currency}
                                            onChange={(event) =>
                                                updateField(
                                                    'currency',
                                                    event.target.value
                                                )
                                            }
                                            disabled={saving}
                                            className={`${inputClass} pl-10`}
                                        >
                                            <option value="NGN">
                                                NGN — Nigerian Naira
                                            </option>

                                            <option value="USD">
                                                USD — US Dollar
                                            </option>

                                            <option value="GBP">
                                                GBP — British Pound
                                            </option>

                                            <option value="EUR">
                                                EUR — Euro
                                            </option>
                                        </select>
                                    </div>
                                </div>

                                {/* Timezone */}
                                <div>
                                    <label className={labelClass}>
                                        Timezone
                                    </label>

                                    <div className="relative">
                                        <Clock3
                                            size={17}
                                            className="
                                                absolute left-3.5 top-1/2
                                                -translate-y-1/2
                                                text-slate-600
                                            "
                                        />

                                        <select
                                            value={form.timezone}
                                            onChange={(event) =>
                                                updateField(
                                                    'timezone',
                                                    event.target.value
                                                )
                                            }
                                            disabled={saving}
                                            className={`${inputClass} pl-10`}
                                        >
                                            <option value="Africa/Lagos">
                                                Africa/Lagos
                                            </option>

                                            <option value="Africa/Accra">
                                                Africa/Accra
                                            </option>

                                            <option value="Europe/London">
                                                Europe/London
                                            </option>

                                            <option value="America/New_York">
                                                America/New_York
                                            </option>

                                            <option value="America/Los_Angeles">
                                                America/Los_Angeles
                                            </option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Actions */}
                        <div
                            className="
                                flex flex-col-reverse gap-3
                                sm:flex-row sm:items-center sm:justify-end
                            "
                        >
                            <Link
                                href="/admin/users/companies"
                                className="
                                    inline-flex
                                    items-center justify-center
                                    rounded-xl
                                    border border-white/[0.08]
                                    bg-slate-900
                                    px-5 py-3
                                    text-sm font-medium
                                    text-slate-300
                                    transition
                                    hover:bg-slate-800
                                    hover:text-white
                                "
                            >
                                Cancel
                            </Link>

                            <button
                                type="submit"
                                disabled={saving}
                                className="
                                    inline-flex
                                    items-center justify-center gap-2
                                    rounded-xl
                                    bg-emerald-400
                                    px-5 py-3
                                    text-sm font-semibold
                                    text-slate-950
                                    transition
                                    hover:bg-emerald-300
                                    disabled:cursor-not-allowed
                                    disabled:opacity-50
                                "
                            >
                                {saving ? (
                                    <>
                                        <Loader2
                                            size={17}
                                            className="animate-spin"
                                        />
                                        Creating Company...
                                    </>
                                ) : (
                                    <>
                                        <Building2 size={17} />
                                        Create Company
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}