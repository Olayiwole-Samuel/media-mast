'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Building2,
    Check,
    ChevronDown,
    Globe,
    Image as ImageIcon,
    Loader2,
    MapPin,
    Megaphone,
    Phone,
    Save,
    Settings2,
    Star,
    Tag,
    X,
} from 'lucide-react';

import {
    getAdminStation,
    getAdminCompanies,
    updateAdminStation,
} from '@/lib/api';

const INPUT =
    'w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500';

const SELECT =
    'w-full appearance-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500';

const TEXTAREA =
    'w-full min-h-[110px] resize-y rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500';

const CARD =
    'rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6';

const EMPTY_FORM = {
    name: '',
    slug: '',
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

    logo: '',
    coverImage: '',
    images: [],

    specifications: {},
    advertisingFormats: [],
    features: [],

    pricing: {
        amount: '',
        currency: 'NGN',
        unit: 'WEEK',
    },

    availability: {},
    operatingHours: {},

    reach: '',
    rating: '',
    reviews: '',

    social: {},
};

const STATION_TYPES = [
    'TV',
    'RADIO',
    'PRESS',
    'BILLBOARD',
    'DIGITAL',
];

const PRICING_UNITS = [
    'DAY',
    'WEEK',
    'MONTH',
    'CAMPAIGN',
    'SPOT',
    'IMPRESSION',
    'CUSTOM',
];

function SectionHeader({ icon: Icon, title, description }) {
    return (
        <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-emerald-400">
                <Icon size={19} />
            </div>

            <div>
                <h2 className="text-base font-semibold text-white">
                    {title}
                </h2>

                {description && (
                    <p className="mt-1 text-sm text-slate-500">
                        {description}
                    </p>
                )}
            </div>
        </div>
    );
}

function Field({ label, required, children, hint }) {
    return (
        <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">
                {label}
                {required && (
                    <span className="ml-1 text-emerald-400">*</span>
                )}
            </label>

            {children}

            {hint && (
                <p className="mt-1.5 text-xs text-slate-500">
                    {hint}
                </p>
            )}
        </div>
    );
}

function parseObject(value) {
    if (!value) return {};

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

function parseArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (!value) {
        return [];
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);

            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            return value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }

    return [];
}

function normalizeStation(station) {
    return {
        name: station?.name || '',
        slug: station?.slug || '',
        type: station?.type || 'TV',
        description: station?.description || '',

        companyId:
            station?.companyId?._id ||
            station?.companyId ||
            '',


        location: {
            address: station?.location?.address || '',
            city: station?.location?.city || '',
            state: station?.location?.state || '',
            country:
                station?.location?.country ||
                'Nigeria',
            coordinates: {
                latitude:
                    station?.location?.coordinates?.latitude ??
                    '',
                longitude:
                    station?.location?.coordinates?.longitude ??
                    '',
            },
        },

        phone: station?.phone || '',
        email: station?.email || '',
        website: station?.website || '',

        logo: station?.logo || '',
        coverImage: station?.coverImage || '',
        images: parseArray(station?.images),

        specifications: parseObject(
            station?.specifications
        ),

        advertisingFormats: parseArray(
            station?.advertisingFormats
        ),

        features: parseArray(station?.features),

        pricing: {
            amount:
                station?.pricing?.amount ??
                '',
            currency:
                station?.pricing?.currency ||
                'NGN',
            unit:
                station?.pricing?.unit ||
                'WEEK',
        },

        availability: parseObject(
            station?.availability
        ),

        operatingHours: parseObject(
            station?.operatingHours
        ),

        reach: station?.reach || '',

        rating:
            station?.rating ??
            '',

        reviews:
            station?.reviews ??
            '',

        social: parseObject(
            station?.social
        ),
    };
}

export default function EditStationPage() {
    const params = useParams();
    const router = useRouter();

    const stationId = params?.id;

    const [form, setForm] = useState(EMPTY_FORM);
    const [companies, setCompanies] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [imageInput, setImageInput] = useState('');
    const [formatInput, setFormatInput] = useState('');
    const [featureInput, setFeatureInput] = useState('');

    const [specificationsText, setSpecificationsText] =
        useState('{}');

    const [availabilityText, setAvailabilityText] =
        useState('{}');

    const [operatingHoursText, setOperatingHoursText] =
        useState('{}');

    const [socialText, setSocialText] =
        useState('{}');

    async function loadPage() {
        try {
            setLoading(true);
            setError('');

            const [stationResponse, companiesResponse] =
                await Promise.all([
                    getAdminStation(stationId),
                    getAdminCompanies(),
                ]);

            const station =
                stationResponse?.data ||
                stationResponse?.station ||
                stationResponse;

            const companiesData =
                companiesResponse?.data ||
                companiesResponse?.companies ||
                companiesResponse;

            const normalized =
                normalizeStation(station);

            setForm(normalized);

            setSpecificationsText(
                JSON.stringify(
                    normalized.specifications || {},
                    null,
                    2
                )
            );

            setAvailabilityText(
                JSON.stringify(
                    normalized.availability || {},
                    null,
                    2
                )
            );

            setOperatingHoursText(
                JSON.stringify(
                    normalized.operatingHours || {},
                    null,
                    2
                )
            );

            setSocialText(
                JSON.stringify(
                    normalized.social || {},
                    null,
                    2
                )
            );

            setCompanies(
                Array.isArray(companiesData)
                    ? companiesData
                    : []
            );
        } catch (err) {
            console.error(
                'Failed to load edit station page:',
                err
            );

            setError(
                err?.message ||
                    'Failed to load station information.'
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!stationId) return;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadPage();
    }, [stationId]);

    const updateField = (field, value) => {
        setForm((previous) => ({
            ...previous,
            [field]: value,
        }));
    };

    const updateNestedField = (
        section,
        field,
        value
    ) => {
        setForm((previous) => ({
            ...previous,
            [section]: {
                ...previous[section],
                [field]: value,
            },
        }));
    };

    const updateCoordinates = (
        field,
        value
    ) => {
        setForm((previous) => ({
            ...previous,
            location: {
                ...previous.location,
                coordinates: {
                    ...previous.location.coordinates,
                    [field]: value,
                },
            },
        }));
    };

    const addToArray = (
        field,
        value,
        clearInput
    ) => {
        const cleanValue = value.trim();

        if (!cleanValue) return;

        if (
            form[field].some(
                (item) =>
                    String(item).toLowerCase() ===
                    cleanValue.toLowerCase()
            )
        ) {
            clearInput('');
            return;
        }

        setForm((previous) => ({
            ...previous,
            [field]: [
                ...previous[field],
                cleanValue,
            ],
        }));

        clearInput('');
    };

    const removeFromArray = (
        field,
        index
    ) => {
        setForm((previous) => ({
            ...previous,
            [field]: previous[field].filter(
                (_, itemIndex) =>
                    itemIndex !== index
            ),
        }));
    };

    const parseJsonField = (
        text,
        fieldName
    ) => {
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(
                `${fieldName} must contain valid JSON.`
            );
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        try {
            setSaving(true);
            setError('');
            setSuccess('');

            if (!form.name.trim()) {
                throw new Error(
                    'Station name is required.'
                );
            }

            if (!form.type) {
                throw new Error(
                    'Station type is required.'
                );
            }

            // A media company is optional: stations are run by Media
            // Masters and their assigned station managers.

            const specifications =
                parseJsonField(
                    specificationsText,
                    'Specifications'
                );

            const availability =
                parseJsonField(
                    availabilityText,
                    'Availability'
                );

            const operatingHours =
                parseJsonField(
                    operatingHoursText,
                    'Operating hours'
                );

            const social =
                parseJsonField(
                    socialText,
                    'Social information'
                );

            const latitude =
                form.location.coordinates.latitude ===
                ''
                    ? null
                    : Number(
                          form.location.coordinates
                              .latitude
                      );

            const longitude =
                form.location.coordinates.longitude ===
                ''
                    ? null
                    : Number(
                          form.location.coordinates
                              .longitude
                      );

            if (
                latitude !== null &&
                Number.isNaN(latitude)
            ) {
                throw new Error(
                    'Latitude must be a valid number.'
                );
            }

            if (
                longitude !== null &&
                Number.isNaN(longitude)
            ) {
                throw new Error(
                    'Longitude must be a valid number.'
                );
            }

            const amount =
                form.pricing.amount === ''
                    ? 0
                    : Number(
                          form.pricing.amount
                      );

            if (Number.isNaN(amount)) {
                throw new Error(
                    'Pricing amount must be a valid number.'
                );
            }

            const rating =
                form.rating === ''
                    ? 0
                    : Number(form.rating);

            const reviews =
                form.reviews === ''
                    ? 0
                    : Number(form.reviews);

            if (
                Number.isNaN(rating) ||
                rating < 0 ||
                rating > 5
            ) {
                throw new Error(
                    'Rating must be between 0 and 5.'
                );
            }

            if (
                Number.isNaN(reviews) ||
                reviews < 0
            ) {
                throw new Error(
                    'Reviews must be a valid number.'
                );
            }

            const payload = {
                name: form.name.trim(),
                type: form.type,
                description:
                    form.description.trim() ||
                    null,

                // Empty = no media company (also unlinks a previous one).
                companyId: form.companyId || null,

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
                        latitude,
                        longitude,
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

                logo:
                    form.logo.trim() ||
                    null,

                coverImage:
                    form.coverImage.trim() ||
                    null,

                images: form.images,

                specifications,

                advertisingFormats:
                    form.advertisingFormats,

                features: form.features,

                pricing: {
                    amount,
                    currency:
                        form.pricing.currency
                            .trim()
                            .toUpperCase() ||
                        'NGN',
                    unit:
                        form.pricing.unit ||
                        'WEEK',
                },

                availability,

                operatingHours,

                reach:
                    form.reach.trim() ||
                    null,

                rating,

                reviews,

                social,
            };

            await updateAdminStation(
                stationId,
                payload
            );

            setSuccess(
                'Station updated successfully.'
            );

            setTimeout(() => {
                router.push(
                    `/admin/stations/${stationId}`
                );
            }, 700);
        } catch (err) {
            console.error(
                'Failed to update station:',
                err
            );

            setError(
                err?.message ||
                    'Failed to update station.'
            );
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950">
                <div className="flex min-h-screen items-center justify-center">
                    <div className="flex items-center gap-3 text-sm text-slate-400">
                        <Loader2
                            size={20}
                            className="animate-spin text-emerald-400"
                        />
                        Loading station...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {/* HEADER */}
                <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <button
                            type="button"
                            onClick={() =>
                                router.push(
                                    `/admin/stations/${stationId}`
                                )
                            }
                            className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
                        >
                            <ArrowLeft size={16} />
                            Back to Station
                        </button>

                        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                            Edit Station
                        </h1>

                        <p className="mt-2 text-sm text-slate-500">
                            Update the station information and
                            advertising configuration.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() =>
                                router.push(
                                    `/admin/stations/${stationId}`
                                )
                            }
                            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            form="station-edit-form"
                            disabled={saving}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
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
                                    <Save size={17} />
                                    Save Changes
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* MESSAGES */}
                {error && (
                    <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        <X
                            size={18}
                            className="mt-0.5 shrink-0"
                        />

                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                        <Check
                            size={18}
                            className="mt-0.5 shrink-0"
                        />

                        <span>{success}</span>
                    </div>
                )}

                <form
                    id="station-edit-form"
                    onSubmit={handleSubmit}
                    className="space-y-6"
                >
                    {/* BASIC INFORMATION */}
                    <section className={CARD}>
                        <SectionHeader
                            icon={Building2}
                            title="Basic Information"
                            description="Core information customers will see about this station."
                        />

                        <div className="grid gap-5 md:grid-cols-2">
                            <Field
                                label="Station Name"
                                required
                            >
                                <input
                                    value={form.name}
                                    onChange={(e) =>
                                        updateField(
                                            'name',
                                            e.target.value
                                        )
                                    }
                                    placeholder="e.g. Channels Television"
                                    className={INPUT}
                                />
                            </Field>

                            <Field
                                label="Station Type"
                                required
                            >
                                <div className="relative">
                                    <select
                                        value={form.type}
                                        onChange={(e) =>
                                            updateField(
                                                'type',
                                                e.target.value
                                            )
                                        }
                                        className={SELECT}
                                    >
                                        {STATION_TYPES.map(
                                            (type) => (
                                                <option
                                                    key={type}
                                                    value={type}
                                                >
                                                    {type}
                                                </option>
                                            )
                                        )}
                                    </select>

                                    <ChevronDown
                                        size={16}
                                        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                                    />
                                </div>
                            </Field>

                            <div className="md:col-span-2">
                                <Field label="Description">
                                    <textarea
                                        value={
                                            form.description
                                        }
                                        onChange={(e) =>
                                            updateField(
                                                'description',
                                                e.target.value
                                            )
                                        }
                                        placeholder="Describe the station, its audience, positioning and advertising opportunities..."
                                        className={TEXTAREA}
                                    />
                                </Field>
                            </div>
                        </div>
                    </section>

                    {/* COMPANY */}
                    <section className={CARD}>
                        <SectionHeader
                            icon={Building2}
                            title="Media Company"
                            description="Optional: a media company that runs this station itself. Most stations are run by station managers instead."
                        />

                        <Field
                            label="Media Company (optional)"
                            hint="Leave empty for a station run by its station managers. A linked company's team can also manage the station's bookings."
                        >
                            <div className="relative">
                                <select
                                    value={
                                        form.companyId
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            'companyId',
                                            e.target.value
                                        )
                                    }
                                    className={SELECT}
                                >
                                    <option value="">
                                        No media company (run by station managers)
                                    </option>

                                    {companies.map(
                                        (company) => (
                                            <option
                                                key={
                                                    company._id
                                                }
                                                value={
                                                    company._id
                                                }
                                            >
                                                {company.name}
                                            </option>
                                        )
                                    )}
                                </select>

                                <ChevronDown
                                    size={16}
                                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                                />
                            </div>
                        </Field>
                    </section>

                    {/* LOCATION */}
                    <section className={CARD}>
                        <SectionHeader
                            icon={MapPin}
                            title="Location"
                            description="Where customers can find this station."
                        />

                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="md:col-span-2">
                                <Field label="Address">
                                    <input
                                        value={
                                            form.location
                                                .address
                                        }
                                        onChange={(e) =>
                                            updateNestedField(
                                                'location',
                                                'address',
                                                e.target.value
                                            )
                                        }
                                        placeholder="Full street address"
                                        className={INPUT}
                                    />
                                </Field>
                            </div>

                            <Field label="City">
                                <input
                                    value={
                                        form.location.city
                                    }
                                    onChange={(e) =>
                                        updateNestedField(
                                            'location',
                                            'city',
                                            e.target.value
                                        )
                                    }
                                    placeholder="Lagos"
                                    className={INPUT}
                                />
                            </Field>

                            <Field label="State">
                                <input
                                    value={
                                        form.location.state
                                    }
                                    onChange={(e) =>
                                        updateNestedField(
                                            'location',
                                            'state',
                                            e.target.value
                                        )
                                    }
                                    placeholder="Lagos"
                                    className={INPUT}
                                />
                            </Field>

                            <Field label="Country">
                                <input
                                    value={
                                        form.location
                                            .country
                                    }
                                    onChange={(e) =>
                                        updateNestedField(
                                            'location',
                                            'country',
                                            e.target.value
                                        )
                                    }
                                    className={INPUT}
                                />
                            </Field>

                            <div className="md:col-span-2">
                                <p className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-500">
                                    Map Coordinates
                                </p>

                                <div className="grid gap-5 sm:grid-cols-2">
                                    <Field label="Latitude">
                                        <input
                                            type="number"
                                            step="any"
                                            value={
                                                form.location
                                                    .coordinates
                                                    .latitude
                                            }
                                            onChange={(e) =>
                                                updateCoordinates(
                                                    'latitude',
                                                    e.target.value
                                                )
                                            }
                                            placeholder="6.5244"
                                            className={INPUT}
                                        />
                                    </Field>

                                    <Field label="Longitude">
                                        <input
                                            type="number"
                                            step="any"
                                            value={
                                                form.location
                                                    .coordinates
                                                    .longitude
                                            }
                                            onChange={(e) =>
                                                updateCoordinates(
                                                    'longitude',
                                                    e.target.value
                                                )
                                            }
                                            placeholder="3.3792"
                                            className={INPUT}
                                        />
                                    </Field>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CONTACT */}
                    <section className={CARD}>
                        <SectionHeader
                            icon={Phone}
                            title="Contact Information"
                            description="Public contact details for the station."
                        />

                        <div className="grid gap-5 md:grid-cols-3">
                            <Field label="Phone">
                                <input
                                    type="tel"
                                    value={form.phone}
                                    onChange={(e) =>
                                        updateField(
                                            'phone',
                                            e.target.value
                                        )
                                    }
                                    placeholder="+234..."
                                    className={INPUT}
                                />
                            </Field>

                            <Field label="Email">
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) =>
                                        updateField(
                                            'email',
                                            e.target.value
                                        )
                                    }
                                    placeholder="station@example.com"
                                    className={INPUT}
                                />
                            </Field>

                            <Field label="Website">
                                <input
                                    type="url"
                                    value={
                                        form.website
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            'website',
                                            e.target.value
                                        )
                                    }
                                    placeholder="https://..."
                                    className={INPUT}
                                />
                            </Field>
                        </div>
                    </section>

                    {/* IMAGES */}
                    <section className={CARD}>
                        <SectionHeader
                            icon={ImageIcon}
                            title="Images"
                            description="Station branding and marketplace images."
                        />

                        <div className="grid gap-5 md:grid-cols-2">
                            <Field label="Logo URL">
                                <input
                                    type="url"
                                    value={form.logo}
                                    onChange={(e) =>
                                        updateField(
                                            'logo',
                                            e.target.value
                                        )
                                    }
                                    placeholder="https://..."
                                    className={INPUT}
                                />
                            </Field>

                            <Field label="Cover Image URL">
                                <input
                                    type="url"
                                    value={
                                        form.coverImage
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            'coverImage',
                                            e.target.value
                                        )
                                    }
                                    placeholder="https://..."
                                    className={INPUT}
                                />
                            </Field>

                            <div className="md:col-span-2">
                                <Field
                                    label="Additional Image URL"
                                    hint="Add images one at a time."
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row">
                                        <input
                                            type="url"
                                            value={
                                                imageInput
                                            }
                                            onChange={(e) =>
                                                setImageInput(
                                                    e.target.value
                                                )
                                            }
                                            placeholder="https://..."
                                            className={INPUT}
                                        />

                                        <button
                                            type="button"
                                            onClick={() =>
                                                addToArray(
                                                    'images',
                                                    imageInput,
                                                    setImageInput
                                                )
                                            }
                                            className="shrink-0 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
                                        >
                                            Add Image
                                        </button>
                                    </div>
                                </Field>

                                {form.images.length > 0 && (
                                    <div className="mt-4 space-y-2">
                                        {form.images.map(
                                            (
                                                image,
                                                index
                                            ) => (
                                                <div
                                                    key={`${image}-${index}`}
                                                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5"
                                                >
                                                    <span className="min-w-0 truncate text-sm text-slate-400">
                                                        {image}
                                                    </span>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            removeFromArray(
                                                                'images',
                                                                index
                                                            )
                                                        }
                                                        className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                                                    >
                                                        <X
                                                            size={
                                                                16
                                                            }
                                                        />
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* ADVERTISING */}
                    <section className={CARD}>
                        <SectionHeader
                            icon={Megaphone}
                            title="Advertising"
                            description="What customers can purchase from this station."
                        />

                        <div className="space-y-6">
                            <Field label="Advertising Formats">
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <input
                                        value={
                                            formatInput
                                        }
                                        onChange={(e) =>
                                            setFormatInput(
                                                e.target.value
                                            )
                                        }
                                        placeholder="e.g. 30-second TV spot"
                                        className={INPUT}
                                    />

                                    <button
                                        type="button"
                                        onClick={() =>
                                            addToArray(
                                                'advertisingFormats',
                                                formatInput,
                                                setFormatInput
                                            )
                                        }
                                        className="shrink-0 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
                                    >
                                        Add Format
                                    </button>
                                </div>

                                {form.advertisingFormats
                                    .length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {form.advertisingFormats.map(
                                            (
                                                item,
                                                index
                                            ) => (
                                                <div
                                                    key={`${item}-${index}`}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
                                                >
                                                    {item}

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            removeFromArray(
                                                                'advertisingFormats',
                                                                index
                                                            )
                                                        }
                                                        className="text-emerald-500 transition hover:text-red-400"
                                                    >
                                                        <X
                                                            size={
                                                                13
                                                            }
                                                        />
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </Field>

                            <Field label="Features">
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <input
                                        value={
                                            featureInput
                                        }
                                        onChange={(e) =>
                                            setFeatureInput(
                                                e.target.value
                                            )
                                        }
                                        placeholder="e.g. Prime time availability"
                                        className={INPUT}
                                    />

                                    <button
                                        type="button"
                                        onClick={() =>
                                            addToArray(
                                                'features',
                                                featureInput,
                                                setFeatureInput
                                            )
                                        }
                                        className="shrink-0 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
                                    >
                                        Add Feature
                                    </button>
                                </div>

                                {form.features
                                    .length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {form.features.map(
                                            (
                                                item,
                                                index
                                            ) => (
                                                <div
                                                    key={`${item}-${index}`}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300"
                                                >
                                                    {item}

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            removeFromArray(
                                                                'features',
                                                                index
                                                            )
                                                        }
                                                        className="text-slate-500 transition hover:text-red-400"
                                                    >
                                                        <X
                                                            size={
                                                                13
                                                            }
                                                        />
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </Field>

                            <Field
                                label="Specifications"
                                hint="JSON object for technical or advertising-specific specifications."
                            >
                                <textarea
                                    value={
                                        specificationsText
                                    }
                                    onChange={(e) =>
                                        setSpecificationsText(
                                            e.target.value
                                        )
                                    }
                                    className={`${TEXTAREA} min-h-[160px] font-mono text-xs`}
                                    spellCheck="false"
                                />
                            </Field>
                        </div>
                    </section>

                    {/* PRICING */}
                    <section className={CARD}>
                        <SectionHeader
                            icon={Tag}
                            title="Pricing"
                            description="Current advertising price used by the marketplace."
                        />

                        <div className="grid gap-5 md:grid-cols-3">
                            <Field label="Amount">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={
                                        form.pricing.amount
                                    }
                                    onChange={(e) =>
                                        updateNestedField(
                                            'pricing',
                                            'amount',
                                            e.target.value
                                        )
                                    }
                                    placeholder="0"
                                    className={INPUT}
                                />
                            </Field>

                            <Field label="Currency">
                                <input
                                    value={
                                        form.pricing
                                            .currency
                                    }
                                    onChange={(e) =>
                                        updateNestedField(
                                            'pricing',
                                            'currency',
                                            e.target.value
                                                .toUpperCase()
                                        )
                                    }
                                    placeholder="NGN"
                                    maxLength={3}
                                    className={INPUT}
                                />
                            </Field>

                            <Field label="Pricing Unit">
                                <div className="relative">
                                    <select
                                        value={
                                            form.pricing
                                                .unit
                                        }
                                        onChange={(e) =>
                                            updateNestedField(
                                                'pricing',
                                                'unit',
                                                e.target.value
                                            )
                                        }
                                        className={SELECT}
                                    >
                                        {PRICING_UNITS.map(
                                            (unit) => (
                                                <option
                                                    key={unit}
                                                    value={unit}
                                                >
                                                    {unit}
                                                </option>
                                            )
                                        )}
                                    </select>

                                    <ChevronDown
                                        size={16}
                                        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                                    />
                                </div>
                            </Field>
                        </div>
                    </section>

                    {/* AVAILABILITY */}
                    <section className={CARD}>
                        <SectionHeader
                            icon={Settings2}
                            title="Availability"
                            description="Additional availability rules and operating information."
                        />

                        <div className="space-y-6">
                            <Field
                                label="Availability"
                                hint="JSON object for availability rules. Inventory status itself is managed separately."
                            >
                                <textarea
                                    value={
                                        availabilityText
                                    }
                                    onChange={(e) =>
                                        setAvailabilityText(
                                            e.target.value
                                        )
                                    }
                                    className={`${TEXTAREA} min-h-[160px] font-mono text-xs`}
                                    spellCheck="false"
                                />
                            </Field>

                            <Field
                                label="Operating Hours"
                                hint="JSON object containing the station's operating hours."
                            >
                                <textarea
                                    value={
                                        operatingHoursText
                                    }
                                    onChange={(e) =>
                                        setOperatingHoursText(
                                            e.target.value
                                        )
                                    }
                                    className={`${TEXTAREA} min-h-[160px] font-mono text-xs`}
                                    spellCheck="false"
                                />
                            </Field>
                        </div>
                    </section>

                    {/* MARKETPLACE */}
                    <section className={CARD}>
                        <SectionHeader
                            icon={Star}
                            title="Marketplace"
                            description="Public-facing marketplace information."
                        />

                        <div className="grid gap-5 md:grid-cols-3">
                            <Field
                                label="Reach"
                                hint="Example: 2.5M monthly viewers"
                            >
                                <input
                                    value={form.reach}
                                    onChange={(e) =>
                                        updateField(
                                            'reach',
                                            e.target.value
                                        )
                                    }
                                    placeholder="e.g. 2.5M monthly viewers"
                                    className={INPUT}
                                />
                            </Field>

                            <Field label="Rating">
                                <input
                                    type="number"
                                    min="0"
                                    max="5"
                                    step="0.1"
                                    value={
                                        form.rating
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            'rating',
                                            e.target.value
                                        )
                                    }
                                    placeholder="0"
                                    className={INPUT}
                                />
                            </Field>

                            <Field label="Reviews">
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={
                                        form.reviews
                                    }
                                    onChange={(e) =>
                                        updateField(
                                            'reviews',
                                            e.target.value
                                        )
                                    }
                                    placeholder="0"
                                    className={INPUT}
                                />
                            </Field>
                        </div>
                    </section>

                    {/* SOCIAL */}
                    <section className={CARD}>
                        <SectionHeader
                            icon={Globe}
                            title="Social Information"
                            description="Social media and other public profile information."
                        />

                        <Field label="Social">
                            <textarea
                                value={socialText}
                                onChange={(e) =>
                                    setSocialText(
                                        e.target.value
                                    )
                                }
                                className={`${TEXTAREA} min-h-[160px] font-mono text-xs`}
                                spellCheck="false"
                                placeholder='{"instagram":"","facebook":"","x":""}'
                               
                            />
                        </Field>
                    </section>

                    {/* BOTTOM ACTIONS */}
                    <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-6 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={() =>
                                router.push(
                                    `/admin/stations/${stationId}`
                                )
                            }
                            className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {saving ? (
                                <>
                                    <Loader2
                                        size={17}
                                        className="animate-spin"
                                    />
                                    Saving Changes...
                                </>
                            ) : (
                                <>
                                    <Save size={17} />
                                    Save Changes
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}