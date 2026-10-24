"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    Users,
    Search,
    RefreshCw,
    Eye,
    Loader2,
    Mail,
    Calendar,
    Clock,
    CheckCircle,
    XCircle,
    UserPlus,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function IndividualsPage() {
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [individuals, setIndividuals] = useState([]);
    const [filteredIndividuals, setFilteredIndividuals] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [error, setError] = useState(null);

    const getToken = () => {
        if (typeof window === "undefined") return null;
        return localStorage.getItem("token");
    };

    const fetchIndividuals = async () => {
        try {
            setIsLoading(true);
            setError(null);

            const token = getToken();

            if (!token) {
                router.push("/login");
                return;
            }

            const response = await fetch(
                `${API_URL}/api/v1/admin/individuals`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Failed to load individuals"
                );
            }

            const data = result.data || [];

            setIndividuals(data);
            setFilteredIndividuals(data);
        } catch (error) {
            console.error("❌ Error fetching individuals:", error);
            setError(error.message || "Failed to load individuals");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchIndividuals();
    }, []);

    const handleSearch = (value) => {
        setSearchQuery(value);

        applyFilters(value, filterStatus);
    };

    const handleStatusFilter = (status) => {
        setFilterStatus(status);

        applyFilters(searchQuery, status);
    };

    const applyFilters = (query, status) => {
        let filtered = [...individuals];

        if (query.trim()) {
            const search = query.toLowerCase().trim();

            filtered = filtered.filter(
                (user) =>
                    user.name?.toLowerCase().includes(search) ||
                    user.email?.toLowerCase().includes(search)
            );
        }

        if (status !== "all") {
            filtered = filtered.filter(
                (user) => user.status === status
            );
        }

        setFilteredIndividuals(filtered);
    };

    const formatDate = (date) => {
        if (!date) return "Never";

        return new Date(date).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    const getStatusColor = (status) => {
        const colors = {
            ACTIVE:
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",

            PENDING:
                "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",

            SUSPENDED:
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",

            DEACTIVATED:
                "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400",
        };

        return (
            colors[status] ||
            "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400"
        );
    };

    const getStatusIcon = (status) => {
        const icons = {
            ACTIVE: <CheckCircle className="h-3 w-3" />,
            PENDING: <Clock className="h-3 w-3" />,
            SUSPENDED: <XCircle className="h-3 w-3" />,
            DEACTIVATED: <Clock className="h-3 w-3" />,
        };

        return icons[status] || null;
    };

    const stats = {
        total: individuals.length,

        active: individuals.filter(
            (user) => user.status === "ACTIVE"
        ).length,

        pending: individuals.filter(
            (user) => user.status === "PENDING"
        ).length,

        suspended: individuals.filter(
            (user) => user.status === "SUSPENDED"
        ).length,
    };

    const viewIndividual = (id) => {
        router.push(`/admin/users/individuals/${id}`);
    };

    if (isLoading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-9 w-9 animate-spin text-emerald-500" />

                    <p className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
                        Loading individuals…
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 dark:bg-red-500/10">
                        <XCircle className="h-6 w-6 text-red-500" />
                    </div>

                    <p className="mt-3 text-sm text-red-500">
                        {error}
                    </p>

                    <button
                        onClick={fetchIndividuals}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
            >
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                        <Users className="h-6 w-6 text-emerald-500" />
                        Individuals
                    </h1>

                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                        Manage and monitor individual users
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchIndividuals}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </button>
                </div>
            </motion.div>

            {/* Stats */}
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Total Individuals
                    </p>

                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                        {stats.total}
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                >
                    <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Active
                    </p>

                    <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                        {stats.active}
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-500/20 dark:bg-yellow-500/10"
                >
                    <p className="text-xs font-medium uppercase tracking-wider text-yellow-600 dark:text-yellow-400">
                        Pending
                    </p>

                    <p className="mt-1 text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                        {stats.pending}
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10"
                >
                    <p className="text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400">
                        Suspended
                    </p>

                    <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">
                        {stats.suspended}
                    </p>
                </motion.div>
            </div>

            {/* Search */}
            <div className="mb-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <input
                        type="text"
                        placeholder="Search individuals by name or email..."
                        value={searchQuery}
                        onChange={(e) =>
                            handleSearch(e.target.value)
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                </div>
            </div>

            {/* Status Filters */}
            <div className="mb-6 flex flex-wrap gap-2">
                {[
                    { value: "all", label: "All" },
                    { value: "ACTIVE", label: "Active" },
                    { value: "PENDING", label: "Pending" },
                    { value: "SUSPENDED", label: "Suspended" },
                    { value: "DEACTIVATED", label: "Deactivated" },
                ].map((option) => (
                    <button
                        key={option.value}
                        onClick={() =>
                            handleStatusFilter(option.value)
                        }
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                            filterStatus === option.value
                                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Individual
                                </th>

                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Status
                                </th>

                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Logins
                                </th>

                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Joined
                                </th>

                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Last Login
                                </th>

                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Action
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filteredIndividuals.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="6"
                                        className="px-4 py-12 text-center"
                                    >
                                        <Users className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />

                                        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                                            {searchQuery
                                                ? "No individuals match your search."
                                                : "No individual users found."}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                filteredIndividuals.map((user) => (
                                    <motion.tr
                                        key={user._id}
                                        initial={{
                                            opacity: 0,
                                            y: 8,
                                        }}
                                        animate={{
                                            opacity: 1,
                                            y: 0,
                                        }}
                                        className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                    >
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                                                    {user.image ? (
                                                        <img
                                                            src={user.image}
                                                            alt={
                                                                user.name ||
                                                                "Individual"
                                                            }
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        user.name
                                                            ?.charAt(0)
                                                            ?.toUpperCase() ||
                                                        "U"
                                                    )}
                                                </div>

                                                <div>
                                                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                        {user.name ||
                                                            "Unknown"}
                                                    </p>

                                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                                                        <Mail className="h-3 w-3" />
                                                        {user.email}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-4 py-4">
                                            <span
                                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(
                                                    user.status
                                                )}`}
                                            >
                                                {getStatusIcon(
                                                    user.status
                                                )}

                                                {user.status}
                                            </span>
                                        </td>

                                        <td className="px-4 py-4">
                                            <span className="text-sm text-slate-600 dark:text-slate-300">
                                                {user.loginCount || 0}
                                            </span>
                                        </td>

                                        <td className="px-4 py-4">
                                            <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                                <Calendar className="h-3.5 w-3.5" />
                                                {formatDate(
                                                    user.createdAt
                                                )}
                                            </span>
                                        </td>

                                        <td className="px-4 py-4">
                                            <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                                <Clock className="h-3.5 w-3.5" />
                                                {formatDate(
                                                    user.lastLogin
                                                )}
                                            </span>
                                        </td>

                                        <td className="px-4 py-4 text-right">
                                            <button
                                                onClick={() =>
                                                    viewIndividual(
                                                        user._id
                                                    )
                                                }
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                View
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                        Showing{" "}
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                            {filteredIndividuals.length}
                        </span>{" "}
                        of{" "}
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                            {individuals.length}
                        </span>{" "}
                        individuals
                    </p>
                </div>
            </div>
        </div>
    );
}