"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Megaphone,
    Search,
    Eye,
    Loader2,
    Calendar,
    Building2,
    User,
    Clock,
    CheckCircle,
    XCircle,
    X,
    TrendingUp,
    Target,
    Wallet,
    Activity,
    ChevronDown,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminCampaignsPage() {
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [campaigns, setCampaigns] = useState([]);
    const [filteredCampaigns, setFilteredCampaigns] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [error, setError] = useState(null);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem("token");
        const userData = localStorage.getItem("user");

        if (!token || !userData) {
            router.push("/login");
            return;
        }

        try {
            const user = JSON.parse(userData);

            if (user.accountType !== "ADMIN") {
                router.push("/dashboard");
                return;
            }

            fetchCampaigns();
        } catch (error) {
            console.error("Error reading user data:", error);
            router.push("/login");
        }
    }, [router]);

    async function fetchCampaigns() {
        try {
            setIsLoading(true);
            setError(null);

            const token = localStorage.getItem("token");

            if (!token) {
                router.push("/login");
                return;
            }

            const response = await fetch(
                `${API_URL}/api/v1/admin/campaigns`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            const contentType =
                response.headers.get("content-type") || "";

            let result;

            if (contentType.includes("application/json")) {
                result = await response.json();
            } else {
                const text = await response.text();

                result = {
                    success: false,
                    message:
                        text ||
                        "Server returned an unexpected response.",
                };
            }

            if (!response.ok) {
                throw new Error(
                    result?.message ||
                        `Failed to load campaigns (${response.status})`
                );
            }

            const campaignData = Array.isArray(result?.data)
                ? result.data
                : [];

            setCampaigns(campaignData);
            setFilteredCampaigns(campaignData);
        } catch (error) {
            console.error("Error fetching admin campaigns:", error);

            setCampaigns([]);
            setFilteredCampaigns([]);
            setError(
                error?.message ||
                    "Failed to load campaigns. Please try again."
            );
        } finally {
            setIsLoading(false);
        }
    }

    const handleSearch = (query) => {
        setSearchQuery(query);
        filterCampaigns(query, filterStatus);
    };

    const handleFilter = (status) => {
        setFilterStatus(status);
        filterCampaigns(searchQuery, status);
    };

    const handleTypeFilter = (type) => {
        filterCampaigns(searchQuery, filterStatus);
    };

    const filterCampaigns = (query, status) => {
        let filtered = [...campaigns];

        if (query.trim()) {
            const normalizedQuery = query.toLowerCase().trim();

            filtered = filtered.filter((campaign) => {
                const name =
                    campaign.name?.toLowerCase() || "";

                const description =
                    campaign.description?.toLowerCase() || "";

                const companyName =
                    campaign.companyId?.name?.toLowerCase() || "";

                const creatorName =
                    campaign.userId?.name?.toLowerCase() || "";

                const creatorEmail =
                    campaign.userId?.email?.toLowerCase() || "";

                return (
                    name.includes(normalizedQuery) ||
                    description.includes(normalizedQuery) ||
                    companyName.includes(normalizedQuery) ||
                    creatorName.includes(normalizedQuery) ||
                    creatorEmail.includes(normalizedQuery)
                );
            });
        }

        if (status !== "all") {
            filtered = filtered.filter(
                (campaign) => campaign.status === status
            );
        }

        setFilteredCampaigns(filtered);
    };

    const getStatusColor = (status) => {
        const colors = {
            DRAFT:
                "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400",

            SUBMITTED:
                "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",

            PAYMENT_PENDING:
                "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400",

            PAYMENT_SUCCESSFUL:
                "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",

            BOOKING_REQUESTS_SENT:
                "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",

            MEDIA_REVIEW:
                "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",

            ACCEPTED:
                "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",

            REJECTED:
                "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",

            REVISION_REQUESTED:
                "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",

            CREATIVE_APPROVED:
                "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",

            SCHEDULED:
                "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400",

            LIVE:
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",

            PROOF_UPLOADED:
                "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",

            COMPANY_REVIEW:
                "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-400",

            COMPLETED:
                "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",

            CANCELLED:
                "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",

            EXPIRED:
                "bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400",

            REFUNDED:
                "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",

            DISPUTED:
                "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",

            FAILED:
                "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
        };

        return (
            colors[status] ||
            "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400"
        );
    };

    const getStatusIcon = (status, size = "h-3 w-3") => {
        const icons = {
            DRAFT: <Clock className={size} />,
            SUBMITTED: <Clock className={size} />,
            PAYMENT_PENDING: <Clock className={size} />,
            PAYMENT_SUCCESSFUL: <CheckCircle className={size} />,
            BOOKING_REQUESTS_SENT: <Clock className={size} />,
            MEDIA_REVIEW: <Clock className={size} />,
            ACCEPTED: <CheckCircle className={size} />,
            REJECTED: <XCircle className={size} />,
            REVISION_REQUESTED: <Clock className={size} />,
            CREATIVE_APPROVED: <CheckCircle className={size} />,
            SCHEDULED: <Clock className={size} />,
            LIVE: <CheckCircle className={size} />,
            PROOF_UPLOADED: <CheckCircle className={size} />,
            COMPANY_REVIEW: <Clock className={size} />,
            COMPLETED: <CheckCircle className={size} />,
            CANCELLED: <XCircle className={size} />,
            EXPIRED: <XCircle className={size} />,
            REFUNDED: <CheckCircle className={size} />,
            DISPUTED: <XCircle className={size} />,
            FAILED: <XCircle className={size} />,
        };

        return icons[status] || <Clock className={size} />;
    };

    const formatStatus = (status) => {
        if (!status) return "Unknown";

        return status
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const formatObjective = (objective) => {
        if (!objective) return "No objective";

        return objective
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const formatCurrency = (amount) => {
        const value = Number(amount) || 0;

        return new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: "NGN",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    const formatDate = (date) => {
        if (!date) return "";

        return new Date(date).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    const getInitials = (name) => {
        if (!name) return "C";

        return name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("");
    };

    const statusOptions = [
        { value: "all", label: "All" },
        { value: "DRAFT", label: "Draft" },
        { value: "SUBMITTED", label: "Submitted" },
        {
            value: "PAYMENT_PENDING",
            label: "Payment Pending",
        },
        {
            value: "PAYMENT_SUCCESSFUL",
            label: "Payment Successful",
        },
        { value: "LIVE", label: "Live" },
        { value: "COMPLETED", label: "Completed" },
        { value: "CANCELLED", label: "Cancelled" },
        { value: "FAILED", label: "Failed" },
    ];

    const stats = {
        total: campaigns.length,

        active: campaigns.filter(
            (campaign) =>
                campaign.status === "LIVE" ||
                campaign.status === "SCHEDULED"
        ).length,

        completed: campaigns.filter(
            (campaign) => campaign.status === "COMPLETED"
        ).length,

        pending: campaigns.filter(
            (campaign) =>
                campaign.status === "DRAFT" ||
                campaign.status === "SUBMITTED" ||
                campaign.status === "PAYMENT_PENDING"
        ).length,

        cancelled: campaigns.filter(
            (campaign) =>
                campaign.status === "CANCELLED" ||
                campaign.status === "FAILED"
        ).length,

        totalBudget: campaigns.reduce(
            (sum, campaign) =>
                sum + (Number(campaign.budget) || 0),
            0
        ),
    };

    const statCards = [
        {
            label: "Total Campaigns",
            value: stats.total,
            icon: Megaphone,
            iconClass:
                "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        },
        {
            label: "Active",
            value: stats.active,
            icon: Activity,
            iconClass:
                "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
        },
        {
            label: "Completed",
            value: stats.completed,
            icon: CheckCircle,
            iconClass:
                "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
        },
        {
            label: "Pending",
            value: stats.pending,
            icon: Clock,
            iconClass:
                "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-400",
        },
    ];

    if (isLoading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                    </div>

                    <p className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
                        Loading campaigns...
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-500/20 dark:bg-slate-900">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-500/10">
                        <XCircle className="h-6 w-6" />
                    </div>

                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Unable to load campaigns
                    </h2>

                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        {error}
                    </p>

                    <button
                        onClick={fetchCampaigns}
                        className="mt-6 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98]"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-full">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="mb-7"
                >
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <div className="mb-3 flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                                    <Megaphone className="h-4 w-4" />
                                </div>

                                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
                                    Campaign Management
                                </span>
                            </div>

                            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                                Campaigns
                            </h1>

                            <p className="mt-1.5 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                                Monitor campaign activity, budgets,
                                progress, and lifecycle status across
                                the platform.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <Activity className="h-4 w-4 text-emerald-500" />

                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                {filteredCampaigns.length}{" "}
                                {filteredCampaigns.length === 1
                                    ? "campaign"
                                    : "campaigns"}{" "}
                                shown
                            </span>
                        </div>
                    </div>
                </motion.div>

                {/* Stats */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.05 }}
                    className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
                >
                    {statCards.map((stat) => {
                        const Icon = stat.icon;

                        return (
                            <div
                                key={stat.label}
                                className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                                            {stat.label}
                                        </p>

                                        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                                            {stat.value}
                                        </p>
                                    </div>

                                    <div
                                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.iconClass}`}
                                    >
                                        <Icon className="h-4 w-4" />
                                    </div>
                                </div>

                                <div className="pointer-events-none absolute -bottom-8 -right-8 h-20 w-20 rounded-full bg-slate-100/50 blur-2xl dark:bg-slate-800/30" />
                            </div>
                        );
                    })}
                </motion.div>

                {/* Budget Summary */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="mb-7 grid gap-3 sm:grid-cols-3"
                >
                    <div className="rounded-xl border border-emerald-200/70 bg-emerald-50 px-4 py-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-600/80 dark:text-emerald-400/80">
                                    Campaign Budget
                                </p>

                                <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                                    {formatCurrency(
                                        stats.totalBudget
                                    )}
                                </p>
                            </div>

                            <Wallet className="h-4 w-4 text-emerald-500/70" />
                        </div>
                    </div>

                    <div className="rounded-xl border border-blue-200/70 bg-blue-50 px-4 py-3.5 dark:border-blue-500/20 dark:bg-blue-500/10">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-blue-600/80 dark:text-blue-400/80">
                                    Active Campaigns
                                </p>

                                <p className="mt-1 text-lg font-semibold text-blue-700 dark:text-blue-400">
                                    {stats.active}
                                </p>
                            </div>

                            <TrendingUp className="h-4 w-4 text-blue-500/70" />
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
                                    Cancelled / Failed
                                </p>

                                <p className="mt-1 text-lg font-semibold text-slate-700 dark:text-slate-300">
                                    {stats.cancelled}
                                </p>
                            </div>

                            <XCircle className="h-4 w-4 text-slate-400" />
                        </div>
                    </div>
                </motion.div>

                {/* Search + Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="mb-5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900"
                >
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <input
                            type="text"
                            placeholder="Search campaigns by name, company, creator..."
                            value={searchQuery}
                            onChange={(e) =>
                                handleSearch(e.target.value)
                            }
                            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
                        />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                        {statusOptions.map((option) => {
                            const active =
                                filterStatus === option.value;

                            return (
                                <button
                                    key={option.value}
                                    onClick={() =>
                                        handleFilter(option.value)
                                    }
                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                                        active
                                            ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Campaign Table */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900"
                >
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Platform Campaigns
                            </h2>

                            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                {filteredCampaigns.length} matching{" "}
                                {filteredCampaigns.length === 1
                                    ? "campaign"
                                    : "campaigns"}
                            </p>
                        </div>

                        <div className="hidden items-center gap-2 sm:flex">
                            <div className="h-2 w-2 rounded-full bg-emerald-500" />

                            <span className="text-[11px] font-medium text-slate-400">
                                Live data
                            </span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1050px]">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Campaign
                                    </th>

                                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Company
                                    </th>

                                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Status
                                    </th>

                                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Budget
                                    </th>

                                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Progress
                                    </th>

                                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Created
                                    </th>

                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Actions
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredCampaigns.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan="7"
                                            className="px-5 py-16 text-center"
                                        >
                                            <div className="mx-auto flex max-w-sm flex-col items-center">
                                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                                                    <Megaphone className="h-5 w-5" />
                                                </div>

                                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                    No campaigns found
                                                </p>

                                                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                                    Try adjusting your search
                                                    or status filter.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredCampaigns.map(
                                        (campaign, index) => {
                                            const progress = Math.min(
                                                Math.max(
                                                    Number(
                                                        campaign.progress
                                                    ) || 0,
                                                    0
                                                ),
                                                100
                                            );

                                            return (
                                                <motion.tr
                                                    key={campaign._id}
                                                    initial={{
                                                        opacity: 0,
                                                        y: 6,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                    }}
                                                    transition={{
                                                        duration: 0.25,
                                                        delay: Math.min(
                                                            index *
                                                                0.025,
                                                            0.3
                                                        ),
                                                    }}
                                                    className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                                                >
                                                    {/* Campaign */}
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                                                                <Megaphone className="h-4 w-4" />
                                                            </div>

                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                                                    {campaign.name ||
                                                                        "Untitled Campaign"}
                                                                </p>

                                                                <div className="mt-0.5 flex items-center gap-1.5">
                                                                    <Target className="h-3 w-3 text-slate-400" />

                                                                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                                                                        {formatObjective(
                                                                            campaign.objective
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Company */}
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-[10px] font-semibold text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
                                                                {getInitials(
                                                                    campaign
                                                                        .companyId
                                                                        ?.name
                                                                )}
                                                            </div>

                                                            <div className="min-w-0">
                                                                <p className="max-w-[170px] truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                                                                    {campaign
                                                                        .companyId
                                                                        ?.name ||
                                                                        "Individual"}
                                                                </p>

                                                                <p className="max-w-[170px] truncate text-[10px] text-slate-400">
                                                                    {campaign
                                                                        .userId
                                                                        ?.name ||
                                                                        "Unknown creator"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Status */}
                                                    <td className="px-4 py-4">
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${getStatusColor(
                                                                campaign.status
                                                            )}`}
                                                        >
                                                            {getStatusIcon(
                                                                campaign.status
                                                            )}

                                                            {formatStatus(
                                                                campaign.status
                                                            )}
                                                        </span>
                                                    </td>

                                                    {/* Budget */}
                                                    <td className="px-4 py-4">
                                                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                            {formatCurrency(
                                                                campaign.budget
                                                            )}
                                                        </p>
                                                    </td>

                                                    {/* Progress */}
                                                    <td className="px-4 py-4">
                                                        <div className="w-[150px]">
                                                            <div className="mb-1.5 flex items-center justify-between">
                                                                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                                                    Progress
                                                                </span>

                                                                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                                                    {
                                                                        progress
                                                                    }
                                                                    %
                                                                </span>
                                                            </div>

                                                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                                                <motion.div
                                                                    initial={{
                                                                        width: 0,
                                                                    }}
                                                                    animate={{
                                                                        width: `${progress}%`,
                                                                    }}
                                                                    transition={{
                                                                        duration: 0.6,
                                                                        delay: 0.1,
                                                                    }}
                                                                    className={`h-full rounded-full ${
                                                                        progress >=
                                                                        70
                                                                            ? "bg-emerald-500"
                                                                            : progress >=
                                                                              40
                                                                            ? "bg-amber-500"
                                                                            : "bg-blue-500"
                                                                    }`}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Created */}
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                                            <Calendar className="h-3.5 w-3.5 text-slate-400" />

                                                            {formatDate(
                                                                campaign.createdAt
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Actions */}
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center justify-end">
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedCampaign(
                                                                        campaign
                                                                    );
                                                                    setShowDetails(
                                                                        true
                                                                    );
                                                                }}
                                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                                                title="View Details"
                                                            >
                                                                <Eye className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            );
                                        }
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            </div>

            {/* Campaign Details Modal */}
            <AnimatePresence>
                {showDetails && selectedCampaign && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-md"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) {
                                setShowDetails(false);
                            }
                        }}
                    >
                        <motion.div
                            initial={{
                                opacity: 0,
                                y: 15,
                                scale: 0.98,
                            }}
                            animate={{
                                opacity: 1,
                                y: 0,
                                scale: 1,
                            }}
                            exit={{
                                opacity: 0,
                                y: 10,
                                scale: 0.98,
                            }}
                            transition={{
                                duration: 0.25,
                                ease: "easeOut",
                            }}
                            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                        >
                            {/* Modal Header */}
                            <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex min-w-0 items-center gap-3.5">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                                            <Megaphone className="h-5 w-5" />
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                                                    {selectedCampaign.name ||
                                                        "Untitled Campaign"}
                                                </h3>

                                                <span
                                                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${getStatusColor(
                                                        selectedCampaign.status
                                                    )}`}
                                                >
                                                    {getStatusIcon(
                                                        selectedCampaign.status
                                                    )}

                                                    {formatStatus(
                                                        selectedCampaign.status
                                                    )}
                                                </span>
                                            </div>

                                            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                                Campaign overview and
                                                platform activity
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() =>
                                            setShowDetails(false)
                                        }
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                        title="Close"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
                                {/* Description */}
                                {selectedCampaign.description && (
                                    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                            Description
                                        </p>

                                        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                            {
                                                selectedCampaign.description
                                            }
                                        </p>
                                    </div>
                                )}

                                {/* Primary Metrics */}
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                                Budget
                                            </p>

                                            <Wallet className="h-4 w-4 text-emerald-500" />
                                        </div>

                                        <p className="mt-2 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                                            {formatCurrency(
                                                selectedCampaign.budget
                                            )}
                                        </p>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                                Progress
                                            </p>

                                            <TrendingUp className="h-4 w-4 text-blue-500" />
                                        </div>

                                        <p className="mt-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
                                            {Math.min(
                                                Math.max(
                                                    Number(
                                                        selectedCampaign.progress
                                                    ) || 0,
                                                    0
                                                ),
                                                100
                                            )}
                                            %
                                        </p>
                                    </div>

                                </div>

                                {/* Progress */}
                                <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                                    <div className="mb-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                                Campaign Progress
                                            </p>

                                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                Current campaign completion
                                            </p>
                                        </div>

                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            {Math.min(
                                                Math.max(
                                                    Number(
                                                        selectedCampaign.progress
                                                    ) || 0,
                                                    0
                                                ),
                                                100
                                            )}
                                            %
                                        </span>
                                    </div>

                                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{
                                                width: `${Math.min(
                                                    Math.max(
                                                        Number(
                                                            selectedCampaign.progress
                                                        ) || 0,
                                                        0
                                                    ),
                                                    100
                                                )}%`,
                                            }}
                                            transition={{
                                                duration: 0.7,
                                            }}
                                            className={`h-full rounded-full ${
                                                selectedCampaign.progress >=
                                                70
                                                    ? "bg-emerald-500"
                                                    : selectedCampaign.progress >=
                                                      40
                                                    ? "bg-amber-500"
                                                    : "bg-blue-500"
                                            }`}
                                        />
                                    </div>
                                </div>

                                {/* Campaign Information */}
                                <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                                    <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Campaign Information
                                    </p>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                                Objective
                                            </p>

                                            <div className="mt-1.5 flex items-center gap-2">
                                                <Target className="h-4 w-4 text-slate-400" />

                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                                    {formatObjective(
                                                        selectedCampaign.objective
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                                Company
                                            </p>

                                            <div className="mt-1.5 flex items-center gap-2">
                                                <Building2 className="h-4 w-4 text-slate-400" />

                                                <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                                                    {selectedCampaign
                                                        .companyId?.name ||
                                                        "Individual Campaign"}
                                                </p>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                                Created By
                                            </p>

                                            <div className="mt-1.5 flex items-center gap-2">
                                                <User className="h-4 w-4 text-slate-400" />

                                                <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                                                    {selectedCampaign.userId
                                                        ?.name ||
                                                        "Unknown"}
                                                </p>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                                Created
                                            </p>

                                            <div className="mt-1.5 flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-slate-400" />

                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                                    {formatDate(
                                                        selectedCampaign.createdAt
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Dates */}
                                {(selectedCampaign.startDate ||
                                    selectedCampaign.endDate) && (
                                    <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                                        <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                            Campaign Schedule
                                        </p>

                                        <div className="grid gap-4 sm:grid-cols-2">
                                            {selectedCampaign.startDate && (
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-400">
                                                        <Calendar className="h-4 w-4" />
                                                    </div>

                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider text-slate-400">
                                                            Start Date
                                                        </p>

                                                        <p className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                                                            {formatDate(
                                                                selectedCampaign.startDate
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {selectedCampaign.endDate && (
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-500 dark:bg-purple-500/10 dark:text-purple-400">
                                                        <Calendar className="h-4 w-4" />
                                                    </div>

                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wider text-slate-400">
                                                            End Date
                                                        </p>

                                                        <p className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                                                            {formatDate(
                                                                selectedCampaign.endDate
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Status Messages */}
                                {selectedCampaign.status ===
                                    "COMPLETED" && (
                                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />

                                        <div>
                                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                                                Campaign completed
                                            </p>

                                            <p className="mt-0.5 text-xs text-emerald-600/80 dark:text-emerald-400/70">
                                                This campaign has reached its
                                                completed status.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {selectedCampaign.status ===
                                    "CANCELLED" && (
                                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
                                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />

                                        <div>
                                            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                                                Campaign cancelled
                                            </p>

                                            <p className="mt-0.5 text-xs text-red-600/80 dark:text-red-400/70">
                                                This campaign is no longer
                                                active.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {selectedCampaign.status ===
                                    "LIVE" && (
                                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                                        <Activity className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />

                                        <div>
                                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                                                Campaign is live
                                            </p>

                                            <p className="mt-0.5 text-xs text-emerald-600/80 dark:text-emerald-400/70">
                                                This campaign is currently
                                                active on the platform.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="border-t border-slate-100 px-6 py-4 dark:border-slate-800">
                                <div className="flex justify-end">
                                    <button
                                        onClick={() =>
                                            setShowDetails(false)
                                        }
                                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}