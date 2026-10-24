'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Building2,
    Search,
    Plus,
    Users,
    CheckCircle2,
    Clock3,
    Ban,
    MoreHorizontal,
    ArrowUpRight,
    Mail,
    Phone,
    Globe2,
    RefreshCw,
    AlertCircle,
    ChevronRight,
    X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAdminCompanies } from '@/lib/api';

const STATUS_CONFIG = {
    APPROVED: {
        label: 'Approved',
        icon: CheckCircle2,
    },
    PENDING: {
        label: 'Pending',
        icon: Clock3,
    },
    SUSPENDED: {
        label: 'Suspended',
        icon: Ban,
    },
    REJECTED: {
        label: 'Rejected',
        icon: X,
    },
};

const formatDate = (date) => {
    if (!date) return '—';

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
        return '—';
    }

    return new Intl.DateTimeFormat('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(parsed);
};

const getInitials = (name = '') => {
    const words = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!words.length) return 'CO';

    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }

    return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

const getCompanyColor = (name = '') => {
    const colors = [
        'from-emerald-400/25 to-emerald-600/10',
        'from-cyan-400/25 to-cyan-600/10',
        'from-violet-400/25 to-violet-600/10',
        'from-blue-400/25 to-blue-600/10',
        'from-amber-400/25 to-amber-600/10',
        'from-rose-400/25 to-rose-600/10',
    ];

    let total = 0;

    for (let i = 0; i < name.length; i += 1) {
        total += name.charCodeAt(i);
    }

    return colors[total % colors.length];
};

function StatusBadge({ status }) {
    const config = STATUS_CONFIG[status] || {
        label: status || 'Unknown',
        icon: AlertCircle,
    };

    const Icon = config.icon;

    return (
        <span
            className={[
                'inline-flex items-center gap-1.5',
                'rounded-full border px-3 py-1.5',
                'text-[11px] font-medium tracking-wide',
                'bg-slate-900/70',
                status === 'APPROVED'
                    ? 'border-emerald-400/20 text-emerald-300'
                    : '',
                status === 'PENDING'
                    ? 'border-amber-400/20 text-amber-300'
                    : '',
                status === 'SUSPENDED'
                    ? 'border-red-400/20 text-red-300'
                    : '',
                status === 'REJECTED'
                    ? 'border-rose-400/20 text-rose-300'
                    : '',
                !STATUS_CONFIG[status]
                    ? 'border-slate-700 text-slate-300'
                    : '',
            ].join(' ')}
        >
            <Icon size={12} />
            {config.label}
        </span>
    );
}

function StatCard({
    label,
    value,
    icon: Icon,
    description,
    delay = 0,
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay }}
            className="
                group relative overflow-hidden
                rounded-[24px]
                border border-white/[0.07]
                bg-slate-900/65
                p-5
                backdrop-blur-xl
                transition-all duration-300
                hover:border-emerald-400/15
                hover:bg-slate-900/80
            "
        >
            <div className="
                pointer-events-none absolute
                -right-8 -top-8
                h-24 w-24
                rounded-full
                bg-emerald-400/[0.04]
                blur-2xl
                transition-all
                group-hover:bg-emerald-400/[0.08]
            " />

            <div className="relative flex items-start justify-between">
                <div>
                    <p className="text-[12px] font-medium tracking-wide text-slate-500">
                        {label}
                    </p>

                    <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-white">
                        {value}
                    </p>

                    <p className="mt-1 text-[11px] text-slate-600">
                        {description}
                    </p>
                </div>

                <div className="
                    flex h-10 w-10 items-center justify-center
                    rounded-[14px]
                    border border-white/[0.06]
                    bg-white/[0.035]
                    text-emerald-400
                ">
                    <Icon size={18} strokeWidth={1.8} />
                </div>
            </div>
        </motion.div>
    );
}

function CompanyAvatar({ company }) {
    const initials = getInitials(company?.name);
    const gradient = getCompanyColor(company?.name);

    if (company?.logo) {
        return (
            <div className="
                h-12 w-12 shrink-0 overflow-hidden
                rounded-[15px]
                border border-white/[0.08]
                bg-slate-900
            ">
                <img
                    src={company.logo}
                    alt={company.name || 'Company'}
                    className="h-full w-full object-cover"
                />
            </div>
        );
    }

    return (
        <div
            className={`
                flex h-12 w-12 shrink-0 items-center justify-center
                rounded-[15px]
                border border-white/[0.08]
                bg-gradient-to-br ${gradient}
                text-sm font-semibold text-white
            `}
        >
            {initials}
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="overflow-hidden rounded-[26px] border border-white/[0.07] bg-slate-900/60">
            <div className="hidden border-b border-white/[0.06] px-5 py-4 md:grid md:grid-cols-[2.2fr_1.5fr_0.8fr_1fr_36px] md:gap-4">
                {[1, 2, 3, 4, 5].map((item) => (
                    <div
                        key={item}
                        className="h-3 animate-pulse rounded-full bg-slate-800"
                    />
                ))}
            </div>

            <div className="divide-y divide-white/[0.05]">
                {[1, 2, 3, 4, 5].map((item) => (
                    <div
                        key={item}
                        className="flex items-center gap-4 px-5 py-5"
                    >
                        <div className="h-12 w-12 animate-pulse rounded-[15px] bg-slate-800" />

                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-36 animate-pulse rounded bg-slate-800" />
                            <div className="h-3 w-48 animate-pulse rounded bg-slate-800/70" />
                        </div>

                        <div className="hidden h-8 w-20 animate-pulse rounded-full bg-slate-800 md:block" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function EmptyState({ search, filter }) {
    const hasFilters = Boolean(search || filter !== 'ALL');

    return (
        <div className="
            flex flex-col items-center justify-center
            rounded-[26px]
            border border-dashed border-white/[0.09]
            bg-slate-900/35
            px-6 py-20
            text-center
        ">
            <div className="
                flex h-16 w-16 items-center justify-center
                rounded-[20px]
                border border-white/[0.07]
                bg-white/[0.035]
                text-slate-500
            ">
                <Building2 size={27} strokeWidth={1.6} />
            </div>

            <h3 className="mt-5 text-base font-semibold text-white">
                {hasFilters ? 'No companies found' : 'No companies yet'}
            </h3>

            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                {hasFilters
                    ? 'Try changing your search or status filter.'
                    : 'Companies created in the Media Masters platform will appear here.'}
            </p>
        </div>
    );
}

export default function AdminCompaniesPage() {
    const router = useRouter();

    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [activeMenu, setActiveMenu] = useState(null);

    const loadCompanies = async () => {
        try {
            setLoading(true);
            setError('');

            const response = await getAdminCompanies();

            const data =
                response?.data?.companies ||
                response?.companies ||
                response?.data ||
                [];

            setCompanies(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load companies:', err);
            setError(
                err?.message ||
                'Unable to load companies. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadCompanies();
    }, []);

    useEffect(() => {
        const closeMenu = () => setActiveMenu(null);

        document.addEventListener('click', closeMenu);

        return () => {
            document.removeEventListener('click', closeMenu);
        };
    }, []);

    const stats = useMemo(() => {
        return {
            total: companies.length,
            approved: companies.filter(
                (company) => company.status === 'APPROVED'
            ).length,
            pending: companies.filter(
                (company) => company.status === 'PENDING'
            ).length,
            suspended: companies.filter(
                (company) => company.status === 'SUSPENDED'
            ).length,
        };
    }, [companies]);

    const filteredCompanies = useMemo(() => {
        const query = search.trim().toLowerCase();

        return companies.filter((company) => {
            const matchesStatus =
                statusFilter === 'ALL' ||
                company.status === statusFilter;

            if (!matchesStatus) return false;

            if (!query) return true;

            return [
                company.name,
                company.email,
                company.phone,
                company.city,
                company.state,
                company.country,
            ]
                .filter(Boolean)
                .some((value) =>
                    String(value).toLowerCase().includes(query)
                );
        });
    }, [companies, search, statusFilter]);

    const openCompany = (id) => {
        if (!id) return;

        router.push(`/admin/users/companies/${id}`);
    };

    return (
        <main
            className="min-h-screen bg-slate-950 text-white"
            onClick={() => setActiveMenu(null)}
        >
            <div className="mx-auto w-full max-w-[1500px] px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45 }}
                    className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
                >
                    <div>
                        <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-400/80">
                            <Building2 size={13} />
                            User Management
                        </div>

                        <h1 className="
                            text-[34px] font-semibold
                            tracking-[-0.045em]
                            text-white
                            sm:text-[40px]
                        ">
                            Companies
                        </h1>

                        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                            Manage organizations, account verification,
                            team members and company access.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => router.push('/admin/users/companies/create')}
                        className="
                            inline-flex h-11 items-center justify-center
                            gap-2
                            rounded-[14px]
                            bg-emerald-400
                            px-5
                            text-sm font-semibold
                            text-slate-950
                            shadow-[0_10px_30px_rgba(52,211,153,0.12)]
                            transition-all duration-200
                            hover:bg-emerald-300
                            active:scale-[0.98]
                        "
                    >
                        <Plus size={17} strokeWidth={2.2} />
                        Add Company
                    </button>
                </motion.div>

                {/* Stats */}
                <div className="
                    mt-8 grid grid-cols-2 gap-3
                    lg:grid-cols-4
                ">
                    <StatCard
                        label="Total companies"
                        value={stats.total}
                        description="All registered organizations"
                        icon={Building2}
                        delay={0.05}
                    />

                    <StatCard
                        label="Approved"
                        value={stats.approved}
                        description="Active company accounts"
                        icon={CheckCircle2}
                        delay={0.1}
                    />

                    <StatCard
                        label="Pending"
                        value={stats.pending}
                        description="Awaiting verification"
                        icon={Clock3}
                        delay={0.15}
                    />

                    <StatCard
                        label="Suspended"
                        value={stats.suspended}
                        description="Currently restricted"
                        icon={Ban}
                        delay={0.2}
                    />
                </div>

                {/* Toolbar */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.2 }}
                    className="
                        mt-7
                        flex flex-col gap-3
                        md:flex-row md:items-center
                    "
                >
                    <div className="relative flex-1">
                        <Search
                            size={17}
                            className="
                                pointer-events-none
                                absolute left-4 top-1/2
                                -translate-y-1/2
                                text-slate-600
                            "
                        />

                        <input
                            type="text"
                            value={search}
                            onChange={(event) =>
                                setSearch(event.target.value)
                            }
                            placeholder="Search companies..."
                            className="
                                h-12 w-full
                                rounded-[16px]
                                border border-white/[0.07]
                                bg-slate-900/60
                                pl-11 pr-10
                                text-sm text-white
                                outline-none
                                placeholder:text-slate-600
                                backdrop-blur-xl
                                transition-all
                                focus:border-emerald-400/30
                                focus:bg-slate-900/80
                            "
                        />

                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                className="
                                    absolute right-3 top-1/2
                                    flex h-7 w-7
                                    -translate-y-1/2
                                    items-center justify-center
                                    rounded-full
                                    text-slate-500
                                    hover:bg-white/[0.05]
                                    hover:text-white
                                "
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="
                        flex h-12
                        overflow-x-auto
                        rounded-[16px]
                        border border-white/[0.07]
                        bg-slate-900/60
                        p-1
                        backdrop-blur-xl
                    ">
                        {[
                            ['ALL', 'All'],
                            ['APPROVED', 'Approved'],
                            ['PENDING', 'Pending'],
                            ['SUSPENDED', 'Suspended'],
                            ['REJECTED', 'Rejected'],
                        ].map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setStatusFilter(value)}
                                className={`
                                    whitespace-nowrap
                                    rounded-[12px]
                                    px-3.5
                                    text-[11px]
                                    font-medium
                                    transition-all
                                    ${
                                        statusFilter === value
                                            ? 'bg-white/[0.08] text-white'
                                            : 'text-slate-600 hover:text-slate-300'
                                    }
                                `}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={loadCompanies}
                        disabled={loading}
                        className="
                            flex h-12 w-12 shrink-0
                            items-center justify-center
                            rounded-[16px]
                            border border-white/[0.07]
                            bg-slate-900/60
                            text-slate-500
                            transition-all
                            hover:border-emerald-400/20
                            hover:text-emerald-400
                            disabled:cursor-not-allowed
                            disabled:opacity-50
                        "
                        aria-label="Refresh companies"
                    >
                        <RefreshCw
                            size={16}
                            className={loading ? 'animate-spin' : ''}
                        />
                    </button>
                </motion.div>

                {/* Results count */}
                {!loading && !error && (
                    <div className="
                        mt-6 flex items-center justify-between
                        text-[11px]
                    ">
                        <p className="text-slate-600">
                            Showing{' '}
                            <span className="font-medium text-slate-400">
                                {filteredCompanies.length}
                            </span>{' '}
                            {filteredCompanies.length === 1
                                ? 'company'
                                : 'companies'}
                        </p>

                        {(search || statusFilter !== 'ALL') && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearch('');
                                    setStatusFilter('ALL');
                                }}
                                className="
                                    text-slate-500
                                    transition-colors
                                    hover:text-emerald-400
                                "
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                )}

                {/* Error */}
                <AnimatePresence>
                    {error && !loading && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="
                                mt-4 flex flex-col gap-4
                                rounded-[20px]
                                border border-red-400/10
                                bg-red-400/[0.035]
                                p-5
                                sm:flex-row sm:items-center sm:justify-between
                            "
                        >
                            <div className="flex items-start gap-3">
                                <div className="
                                    flex h-9 w-9 shrink-0
                                    items-center justify-center
                                    rounded-[12px]
                                    bg-red-400/[0.08]
                                    text-red-400
                                ">
                                    <AlertCircle size={17} />
                                </div>

                                <div>
                                    <p className="text-sm font-medium text-red-300">
                                        Unable to load companies
                                    </p>

                                    <p className="mt-1 text-xs text-red-300/50">
                                        {error}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={loadCompanies}
                                className="
                                    rounded-[12px]
                                    border border-red-400/10
                                    px-4 py-2
                                    text-xs font-medium
                                    text-red-300
                                    transition-colors
                                    hover:bg-red-400/[0.06]
                                "
                            >
                                Try again
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Table */}
                <div className="mt-3">
                    {loading ? (
                        <LoadingSkeleton />
                    ) : error ? null : filteredCompanies.length === 0 ? (
                        <EmptyState
                            search={search}
                            filter={statusFilter}
                        />
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.4 }}
                            className="
                                overflow-hidden
                                rounded-[26px]
                                border border-white/[0.07]
                                bg-slate-900/50
                                backdrop-blur-xl
                            "
                        >
                            {/* Desktop header */}
                            <div className="
                                hidden
                                border-b border-white/[0.06]
                                px-5 py-4
                                md:grid
                                md:grid-cols-[2.2fr_1.6fr_0.8fr_1fr_36px]
                                md:items-center
                                md:gap-4
                            ">
                                <span className="
                                    text-[10px] font-semibold
                                    uppercase tracking-[0.15em]
                                    text-slate-600
                                ">
                                    Company
                                </span>

                                <span className="
                                    text-[10px] font-semibold
                                    uppercase tracking-[0.15em]
                                    text-slate-600
                                ">
                                    Contact
                                </span>

                                <span className="
                                    text-[10px] font-semibold
                                    uppercase tracking-[0.15em]
                                    text-slate-600
                                ">
                                    Members
                                </span>

                                <span className="
                                    text-[10px] font-semibold
                                    uppercase tracking-[0.15em]
                                    text-slate-600
                                ">
                                    Status
                                </span>

                                <span />
                            </div>

                            <div className="divide-y divide-white/[0.05]">
                                {filteredCompanies.map((company, index) => (
                                    <motion.div
                                        key={company._id}
                                        initial={{
                                            opacity: 0,
                                            y: 8,
                                        }}
                                        animate={{
                                            opacity: 1,
                                            y: 0,
                                        }}
                                        transition={{
                                            duration: 0.3,
                                            delay: Math.min(
                                                index * 0.035,
                                                0.3
                                            ),
                                        }}
                                        onClick={() =>
                                            openCompany(company._id)
                                        }
                                        className="
                                            group relative
                                            cursor-pointer
                                            px-4 py-4
                                            transition-colors
                                            hover:bg-white/[0.025]
                                            sm:px-5
                                        "
                                    >
                                        {/* Desktop */}
                                        <div className="
                                            hidden
                                            md:grid
                                            md:grid-cols-[2.2fr_1.6fr_0.8fr_1fr_36px]
                                            md:items-center
                                            md:gap-4"
                                        >
                                            <div className="flex min-w-0 items-center gap-3.5">
                                                <CompanyAvatar company={company} />

                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="
                                                            truncate
                                                            text-sm font-semibold
                                                            text-slate-100
                                                            transition-colors
                                                            group-hover:text-white
                                                        ">
                                                            {company.name || 'Unnamed Company'}
                                                        </p>

                                                        <ArrowUpRight
                                                            size={13}
                                                            className="
                                                                shrink-0
                                                                text-slate-700
                                                                transition-all
                                                                group-hover:text-emerald-400
                                                            "
                                                        />
                                                    </div>

                                                    <p className="
                                                        mt-1 truncate
                                                        text-[11px]
                                                        text-slate-600
                                                    ">
                                                        Joined {formatDate(company.createdAt)}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 text-slate-400">
                                                    <Mail
                                                        size={13}
                                                        className="shrink-0 text-slate-600"
                                                    />

                                                    <span className="truncate text-xs">
                                                        {company.email || 'No email'}
                                                    </span>
                                                </div>

                                                {company.phone && (
                                                    <div className="mt-1 flex items-center gap-2 text-slate-600">
                                                        <Phone
                                                            size={11}
                                                            className="shrink-0"
                                                        />

                                                        <span className="truncate text-[10px]">
                                                            {company.phone}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 text-slate-300">
                                                <Users
                                                    size={14}
                                                    className="text-slate-600"
                                                />

                                                <span className="text-sm font-medium">
                                                    {Number(company.userCount || 0)}
                                                </span>
                                            </div>

                                            <div>
                                                <StatusBadge
                                                    status={company.status}
                                                />
                                            </div>

                                            <div className="relative flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setActiveMenu(
                                                            activeMenu === company._id
                                                                ? null
                                                                : company._id
                                                        );
                                                    }}
                                                    className="
                                                        flex h-8 w-8
                                                        items-center justify-center
                                                        rounded-[10px]
                                                        text-slate-600
                                                        transition-all
                                                        hover:bg-white/[0.06]
                                                        hover:text-white
                                                    "
                                                >
                                                    <MoreHorizontal size={17} />
                                                </button>

                                                <AnimatePresence>
                                                    {activeMenu === company._id && (
                                                        <motion.div
                                                            initial={{
                                                                opacity: 0,
                                                                scale: 0.96,
                                                                y: -4,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                                scale: 1,
                                                                y: 0,
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                                scale: 0.96,
                                                            }}
                                                            transition={{
                                                                duration: 0.15,
                                                            }}
                                                            onClick={(event) =>
                                                                event.stopPropagation()
                                                            }
                                                            className="
                                                                absolute right-0 top-10 z-30
                                                                w-44
                                                                overflow-hidden
                                                                rounded-[15px]
                                                                border border-white/[0.08]
                                                                bg-slate-900
                                                                p-1.5
                                                                shadow-2xl
                                                            "
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openCompany(
                                                                        company._id
                                                                    )
                                                                }
                                                                className="
                                                                    flex w-full
                                                                    items-center gap-2
                                                                    rounded-[10px]
                                                                    px-3 py-2.5
                                                                    text-left
                                                                    text-xs
                                                                    text-slate-400
                                                                    transition-colors
                                                                    hover:bg-white/[0.05]
                                                                    hover:text-white
                                                                "
                                                            >
                                                                <ArrowUpRight size={14} />
                                                                View company
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    router.push(
                                                                        `/admin/users/companies/${company._id}/edit`
                                                                    )
                                                                }
                                                                className="
                                                                    flex w-full
                                                                    items-center gap-2
                                                                    rounded-[10px]
                                                                    px-3 py-2.5
                                                                    text-left
                                                                    text-xs
                                                                    text-slate-400
                                                                    transition-colors
                                                                    hover:bg-white/[0.05]
                                                                    hover:text-white
                                                                "
                                                            >
                                                                <Building2 size={14} />
                                                                Edit company
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        {/* Mobile */}
                                        <div className="md:hidden">
                                            <div className="flex items-start gap-3">
                                                <CompanyAvatar company={company} />

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="
                                                                truncate
                                                                text-sm font-semibold
                                                                text-white
                                                            ">
                                                                {company.name || 'Unnamed Company'}
                                                            </p>

                                                            <p className="
                                                                mt-1 truncate
                                                                text-[11px]
                                                                text-slate-600
                                                            ">
                                                                {company.email || 'No email'}
                                                            </p>
                                                        </div>

                                                        <ChevronRight
                                                            size={17}
                                                            className="
                                                                mt-1 shrink-0
                                                                text-slate-700
                                                            "
                                                        />
                                                    </div>

                                                    <div className="
                                                        mt-3 flex flex-wrap
                                                        items-center gap-2
                                                    ">
                                                        <StatusBadge
                                                            status={company.status}
                                                        />

                                                        <span className="
                                                            inline-flex items-center gap-1.5
                                                            rounded-full
                                                            border border-white/[0.06]
                                                            bg-white/[0.02]
                                                            px-3 py-1.5
                                                            text-[10px]
                                                            text-slate-500
                                                        ">
                                                            <Users size={11} />
                                                            {Number(company.userCount || 0)} members
                                                        </span>
                                                    </div>

                                                    <div className="
                                                        mt-3 flex flex-wrap
                                                        items-center gap-x-4 gap-y-1
                                                        text-[10px]
                                                        text-slate-700
                                                    ">
                                                        {company.phone && (
                                                            <span className="flex items-center gap-1.5">
                                                                <Phone size={10} />
                                                                {company.phone}
                                                            </span>
                                                        )}

                                                        {company.website && (
                                                            <span className="flex items-center gap-1.5">
                                                                <Globe2 size={10} />
                                                                Website
                                                            </span>
                                                        )}

                                                        <span>
                                                            Joined {formatDate(company.createdAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </main>
    );
}