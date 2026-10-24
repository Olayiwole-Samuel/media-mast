"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Building2,
    Search,
    CheckCircle,
    XCircle,
    Eye,
    Loader2,
    Sparkles,
    Users,
    Calendar,
    Mail,
    Phone,
    Globe,
    MapPin,
    Clock,
    ArrowUpRight,
    Activity,
    X,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminCompaniesPage() {
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [companies, setCompanies] = useState([]);
    const [filteredCompanies, setFilteredCompanies] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [selectedCompany, setSelectedCompany] = useState(null);
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

            fetchCompanies();
        } catch {
            router.push("/login");
        }
    }, [router]);

    async function fetchCompanies() {
        try {
            setError(null);

            const token = localStorage.getItem("token");

            const response = await fetch(
                `${API_URL}/api/v1/admin/companies`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message || "Failed to load companies"
                );
            }

            setCompanies(result.data);
            setFilteredCompanies(result.data);
        } catch (error) {
            console.error("Error fetching companies:", error);
            setError(error.message);
        } finally {
            setIsLoading(false);
        }
    }

    const handleSearch = (query) => {
        setSearchQuery(query);
        filterCompanies(query, filterStatus);
    };

    const handleFilter = (status) => {
        setFilterStatus(status);
        filterCompanies(searchQuery, status);
    };

    const filterCompanies = (query, status) => {
        let filtered = companies;

        if (query) {
            const normalizedQuery = query.toLowerCase();

            filtered = filtered.filter(
                (company) =>
                    company.name
                        ?.toLowerCase()
                        .includes(normalizedQuery) ||
                    company.email
                        ?.toLowerCase()
                        .includes(normalizedQuery) ||
                    company.slug
                        ?.toLowerCase()
                        .includes(normalizedQuery)
            );
        }

        if (status !== "all") {
            filtered = filtered.filter(
                (company) => company.status === status
            );
        }

        setFilteredCompanies(filtered);
    };

    const handleApprove = async (id) => {
        setActionLoading(id);

        try {
            const token = localStorage.getItem("token");

            const response = await fetch(
                `${API_URL}/api/v1/admin/companies/${id}/verification`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ status: "APPROVED" }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message || "Failed to approve company"
                );
            }

            await fetchCompanies();
        } catch (error) {
            console.error("Error approving company:", error);
            alert(error.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (id) => {
        if (
            !confirm(
                "Are you sure you want to reject this company?"
            )
        ) {
            return;
        }

        setActionLoading(id);

        try {
            const token = localStorage.getItem("token");

            const response = await fetch(
                `${API_URL}/api/v1/admin/companies/${id}/verification`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ status: "REJECTED" }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message || "Failed to reject company"
                );
            }

            await fetchCompanies();
        } catch (error) {
            console.error("Error rejecting company:", error);
            alert(error.message);
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusConfig = (status) => {
        const configs = {
            PENDING: {
                color:
                    "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20",
                icon: Clock,
                iconColor: "text-yellow-500",
                dot: "bg-yellow-500",
            },

            APPROVED: {
                color:
                    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
                icon: CheckCircle,
                iconColor: "text-emerald-500",
                dot: "bg-emerald-500",
            },

            REJECTED: {
                color:
                    "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
                icon: XCircle,
                iconColor: "text-red-500",
                dot: "bg-red-500",
            },

            SUSPENDED: {
                color:
                    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
                icon: Clock,
                iconColor: "text-orange-500",
                dot: "bg-orange-500",
            },
        };

        return (
            configs[status] || {
                color:
                    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-700",
                icon: Clock,
                iconColor: "text-slate-400",
                dot: "bg-slate-400",
            }
        );
    };

    const renderStatus = (status) => {
        const config = getStatusConfig(status);
        const Icon = config.icon;

        return (
            <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.color}`}
            >
                <Icon
                    className={`h-3 w-3 ${config.iconColor}`}
                    strokeWidth={2}
                />

                {status}
            </span>
        );
    };

    const formatDate = (date) => {
        if (!date) return "";

        return new Date(date).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    const statusOptions = [
        { value: "all", label: "All" },
        { value: "PENDING", label: "Pending" },
        { value: "APPROVED", label: "Approved" },
        { value: "REJECTED", label: "Rejected" },
        { value: "SUSPENDED", label: "Suspended" },
    ];

    const stats = {
        total: companies.length,
        pending: companies.filter(
            (company) => company.status === "PENDING"
        ).length,
        approved: companies.filter(
            (company) => company.status === "APPROVED"
        ).length,
        rejected: companies.filter(
            (company) => company.status === "REJECTED"
        ).length,
    };

    if (isLoading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center bg-slate-50/80 dark:bg-slate-950">
                <motion.div
                    initial={{
                        opacity: 0,
                        scale: 0.96,
                    }}
                    animate={{
                        opacity: 1,
                        scale: 1,
                    }}
                    className="flex flex-col items-center"
                >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                    </div>

                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Loading companies
                    </p>
                </motion.div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center bg-slate-50/80 px-6 dark:bg-slate-950">
                <motion.div
                    initial={{
                        opacity: 0,
                        y: 10,
                    }}
                    animate={{
                        opacity: 1,
                        y: 0,
                    }}
                    className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                    <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-500/10">
                        <XCircle className="h-5 w-5 text-red-500" />
                    </div>

                    <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                        Something went wrong
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {error}
                    </p>

                    <button
                        onClick={fetchCompanies}
                        className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md active:scale-[0.98]"
                    >
                        Try again
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50/80 dark:bg-slate-950">
            <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

                {/* Header */}
                <motion.div
                    initial={{
                        opacity: 0,
                        y: -12,
                    }}
                    animate={{
                        opacity: 1,
                        y: 0,
                    }}
                    className="mb-8"
                >
                    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                        <div>
                            <div className="mb-3 flex items-center gap-2.5">
                                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 text-[11px] font-semibold tracking-wide text-emerald-600 dark:text-emerald-400">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    PLATFORM MANAGEMENT
                                </span>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/10">
                                    <Building2 className="h-5 w-5 text-emerald-500" />
                                </div>

                                <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white sm:text-4xl">
                                    Companies
                                </h1>
                            </div>

                            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                                Review, monitor and manage companies
                                registered on the Media Masters platform.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <Activity className="h-4 w-4 text-emerald-500" />

                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                {filteredCompanies.length}{" "}
                                {filteredCompanies.length === 1
                                    ? "company"
                                    : "companies"}
                            </span>
                        </div>
                    </div>
                </motion.div>

                {/* Stats */}
                <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {[
                        {
                            label: "Total",
                            value: stats.total,
                            color:
                                "text-slate-950 dark:text-white",
                            background:
                                "bg-slate-100 dark:bg-slate-800",
                        },
                        {
                            label: "Pending",
                            value: stats.pending,
                            color:
                                "text-yellow-700 dark:text-yellow-400",
                            background:
                                "bg-yellow-50 dark:bg-yellow-500/10",
                        },
                        {
                            label: "Approved",
                            value: stats.approved,
                            color:
                                "text-emerald-700 dark:text-emerald-400",
                            background:
                                "bg-emerald-50 dark:bg-emerald-500/10",
                        },
                        {
                            label: "Rejected",
                            value: stats.rejected,
                            color:
                                "text-red-700 dark:text-red-400",
                            background:
                                "bg-red-50 dark:bg-red-500/10",
                        },
                    ].map((stat, index) => (
                        <motion.div
                            key={stat.label}
                            initial={{
                                opacity: 0,
                                y: 10,
                            }}
                            animate={{
                                opacity: 1,
                                y: 0,
                            }}
                            transition={{
                                delay: index * 0.04,
                            }}
                            className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_35px_rgba(15,23,42,0.06)] dark:border-slate-800/80 dark:bg-slate-900 dark:hover:border-slate-700"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                        {stat.label}
                                    </p>

                                    <p
                                        className={`mt-3 text-3xl font-semibold tracking-[-0.04em] ${stat.color}`}
                                    >
                                        {stat.value}
                                    </p>
                                </div>

                                <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.background}`}
                                >
                                    <Building2
                                        className={`h-[18px] w-[18px] ${stat.color}`}
                                        strokeWidth={1.8}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Search + Filters */}
                <motion.div
                    initial={{
                        opacity: 0,
                        y: 10,
                    }}
                    animate={{
                        opacity: 1,
                        y: 0,
                    }}
                    transition={{
                        delay: 0.12,
                    }}
                    className="mb-5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-slate-800/80 dark:bg-slate-900"
                >
                    <div className="flex flex-col gap-3 xl:flex-row">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                            <input
                                type="text"
                                placeholder="Search by company name, email or slug..."
                                value={searchQuery}
                                onChange={(e) =>
                                    handleSearch(e.target.value)
                                }
                                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white dark:placeholder:text-slate-600 dark:focus:bg-slate-950"
                            />
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 p-1 dark:bg-slate-950/60">
                            {statusOptions.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() =>
                                        handleFilter(option.value)
                                    }
                                    className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
                                        filterStatus === option.value
                                            ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400"
                                            : "text-slate-500 hover:bg-white/70 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800/70 dark:hover:text-slate-300"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* Companies Table */}
                <motion.div
                    initial={{
                        opacity: 0,
                        y: 12,
                    }}
                    animate={{
                        opacity: 1,
                        y: 0,
                    }}
                    transition={{
                        delay: 0.18,
                    }}
                    className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-slate-800/80 dark:bg-slate-900"
                >
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
                        <div>
                            <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                                Company Directory
                            </h2>

                            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                Registered platform companies
                            </p>
                        </div>

                        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                            {filteredCompanies.length} results
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px]">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800">
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                        Company
                                    </th>

                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                        Contact
                                    </th>

                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                        Users
                                    </th>

                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                        Status
                                    </th>

                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                        Joined
                                    </th>

                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                        Actions
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredCompanies.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan="6"
                                            className="px-6 py-16 text-center"
                                        >
                                            <div className="mx-auto flex max-w-xs flex-col items-center">
                                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800">
                                                    <Building2 className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                                                </div>

                                                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                    No companies found
                                                </h3>

                                                <p className="mt-1 text-xs leading-5 text-slate-400 dark:text-slate-500">
                                                    Try adjusting your search
                                                    or status filter.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredCompanies.map(
                                        (company, index) => (
                                            <motion.tr
                                                key={company._id}
                                                initial={{
                                                    opacity: 0,
                                                }}
                                                animate={{
                                                    opacity: 1,
                                                }}
                                                transition={{
                                                    delay:
                                                        index * 0.02,
                                                }}
                                                className="group transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                                            >
                                                {/* Company */}
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10">
                                                            <Building2
                                                                className="h-[17px] w-[17px]"
                                                                strokeWidth={
                                                                    1.8
                                                                }
                                                            />
                                                        </div>

                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                                                {
                                                                    company.name
                                                                }
                                                            </p>

                                                            <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                                                                {
                                                                    company.slug
                                                                }
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Contact */}
                                                <td className="px-5 py-4">
                                                    <a
                                                        href={`mailto:${company.email}`}
                                                        className="max-w-[240px] truncate text-sm text-slate-500 transition-colors hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
                                                    >
                                                        {
                                                            company.email
                                                        }
                                                    </a>
                                                </td>

                                                {/* Users */}
                                                <td className="px-5 py-4">
                                                    <div className="inline-flex items-center gap-2">
                                                        <Users className="h-3.5 w-3.5 text-slate-400" />

                                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                                            {company.userCount ||
                                                                0}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Status */}
                                                <td className="px-5 py-4">
                                                    {renderStatus(
                                                        company.status
                                                    )}
                                                </td>

                                                {/* Joined */}
                                                <td className="px-5 py-4">
                                                    <span className="text-sm text-slate-500 dark:text-slate-400">
                                                        {formatDate(
                                                            company.createdAt
                                                        )}
                                                    </span>
                                                </td>

                                                {/* Actions */}
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedCompany(
                                                                    company
                                                                );
                                                                setShowDetails(
                                                                    true
                                                                );
                                                            }}
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                                            title="View details"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </button>

                                                        {company.status ===
                                                            "PENDING" && (
                                                            <>
                                                                <button
                                                                    onClick={() =>
                                                                        handleApprove(
                                                                            company._id
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        actionLoading ===
                                                                        company._id
                                                                    }
                                                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-500 transition-all hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:hover:bg-emerald-500/10"
                                                                    title="Approve"
                                                                >
                                                                    {actionLoading ===
                                                                    company._id ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <CheckCircle className="h-4 w-4" />
                                                                    )}
                                                                </button>

                                                                <button
                                                                    onClick={() =>
                                                                        handleReject(
                                                                            company._id
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        actionLoading ===
                                                                        company._id
                                                                    }
                                                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition-all hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
                                                                    title="Reject"
                                                                >
                                                                    {actionLoading ===
                                                                    company._id ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <XCircle className="h-4 w-4" />
                                                                    )}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        )
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            </div>

            {/* Company Details Modal */}
            <AnimatePresence>
                {showDetails && selectedCompany && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md"
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                                setShowDetails(false);
                            }
                        }}
                    >
                        <motion.div
                            initial={{
                                opacity: 0,
                                scale: 0.97,
                                y: 10,
                            }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                                y: 0,
                            }}
                            exit={{
                                opacity: 0,
                                scale: 0.97,
                                y: 10,
                            }}
                            transition={{
                                duration: 0.2,
                            }}
                            className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_25px_80px_rgba(15,23,42,0.18)] dark:border-slate-800 dark:bg-slate-900"
                        >
                            {/* Modal Header */}
                            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/10">
                                        <Building2 className="h-5 w-5 text-emerald-500" />
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                                            Company Details
                                        </h3>

                                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                            Platform company profile
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() =>
                                        setShowDetails(false)
                                    }
                                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                    title="Close"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
                                {/* Identity */}
                                <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-500 shadow-sm dark:bg-slate-900">
                                            <Building2 className="h-5 w-5" />
                                        </div>

                                        <div className="min-w-0">
                                            <p className="truncate text-base font-semibold text-slate-900 dark:text-white">
                                                {
                                                    selectedCompany.name
                                                }
                                            </p>

                                            <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                                                {
                                                    selectedCompany.slug
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    {renderStatus(
                                        selectedCompany.status
                                    )}
                                </div>

                                <div className="grid gap-5 sm:grid-cols-2">
                                    {/* Name */}
                                    <div>
                                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                            Name
                                        </p>

                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                            {
                                                selectedCompany.name
                                            }
                                        </p>
                                    </div>

                                    {/* Slug */}
                                    <div>
                                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                            Slug
                                        </p>

                                        <p className="break-all text-sm text-slate-500 dark:text-slate-400">
                                            {
                                                selectedCompany.slug
                                            }
                                        </p>
                                    </div>

                                    {/* Email */}
                                    <div>
                                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                            Email
                                        </p>

                                        <a
                                            href={`mailto:${selectedCompany.email}`}
                                            className="flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-emerald-600 dark:text-slate-300 dark:hover:text-emerald-400"
                                        >
                                            <Mail className="h-4 w-4 text-slate-400" />
                                            <span className="break-all">
                                                {
                                                    selectedCompany.email
                                                }
                                            </span>
                                        </a>
                                    </div>

                                    {/* Phone */}
                                    {selectedCompany.phone && (
                                        <div>
                                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                                Phone
                                            </p>

                                            <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                <Phone className="h-4 w-4 text-slate-400" />
                                                {
                                                    selectedCompany.phone
                                                }
                                            </p>
                                        </div>
                                    )}

                                    {/* Website */}
                                    {selectedCompany.website && (
                                        <div>
                                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                                Website
                                            </p>

                                            <a
                                                href={
                                                    selectedCompany.website
                                                }
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 break-all text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                                            >
                                                <Globe className="h-4 w-4 shrink-0" />
                                                {
                                                    selectedCompany.website
                                                }
                                                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                                            </a>
                                        </div>
                                    )}

                                    {/* Users */}
                                    <div>
                                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                            Users
                                        </p>

                                        <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                            <Users className="h-4 w-4 text-slate-400" />
                                            {
                                                selectedCompany.userCount ||
                                                0
                                            }{" "}
                                            users
                                        </p>
                                    </div>

                                    {/* Joined */}
                                    <div>
                                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                            Joined
                                        </p>

                                        <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                            <Calendar className="h-4 w-4 text-slate-400" />
                                            {formatDate(
                                                selectedCompany.createdAt
                                            )}
                                        </p>
                                    </div>

                                    {/* Address */}
                                    {selectedCompany.address && (
                                        <div className="sm:col-span-2">
                                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                                Address
                                            </p>

                                            <p className="flex items-start gap-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                                {
                                                    selectedCompany.address
                                                }
                                            </p>
                                        </div>
                                    )}

                                    {/* Description */}
                                    {selectedCompany.description && (
                                        <div className="sm:col-span-2">
                                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                                Description
                                            </p>

                                            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                {
                                                    selectedCompany.description
                                                }
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Actions */}
                            {selectedCompany.status ===
                                "PENDING" && (
                                <div className="flex gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/30">
                                    <button
                                        onClick={() => {
                                            handleApprove(
                                                selectedCompany._id
                                            );
                                            setShowDetails(false);
                                        }}
                                        disabled={
                                            actionLoading ===
                                            selectedCompany._id
                                        }
                                        className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md disabled:opacity-50"
                                    >
                                        {actionLoading ===
                                        selectedCompany._id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <CheckCircle className="h-4 w-4" />
                                        )}

                                        Approve Company
                                    </button>

                                    <button
                                        onClick={() => {
                                            handleReject(
                                                selectedCompany._id
                                            );
                                            setShowDetails(false);
                                        }}
                                        disabled={
                                            actionLoading ===
                                            selectedCompany._id
                                        }
                                        className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600 transition-all hover:bg-red-100 disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15"
                                    >
                                        {actionLoading ===
                                        selectedCompany._id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <XCircle className="h-4 w-4" />
                                        )}

                                        Reject Company
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}