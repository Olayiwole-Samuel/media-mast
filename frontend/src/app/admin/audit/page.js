"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
    FileText,
    Search,
    Loader2,
    Calendar,
    User,
    Clock,
    CheckCircle,
    XCircle,
    RefreshCw,
    Activity,
    Users,
    ShieldCheck,
    X,
    Database,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminAuditPage() {
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [logs, setLogs] = useState([]);
    const [filteredLogs, setFilteredLogs] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterAction, setFilterAction] = useState("all");
    const [error, setError] = useState(null);
    const [selectedLog, setSelectedLog] = useState(null);

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

            fetchAuditLogs();
        } catch {
            router.push("/login");
        }
    }, [router]);

    async function fetchAuditLogs() {
        try {
            setIsLoading(true);
            setError(null);

            const token = localStorage.getItem("token");

            if (!token) {
                router.push("/login");
                return;
            }

            const response = await fetch(
                `${API_URL}/api/v1/admin/dashboard`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
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
                    message:
                        text ||
                        "Server returned an unexpected response",
                };
            }

            if (!response.ok) {
                throw new Error(
                    result.message ||
                        "Failed to load audit logs"
                );
            }

            const activity =
                Array.isArray(result.data?.recentActivity)
                    ? result.data.recentActivity
                    : [];

            setLogs(activity);
            setFilteredLogs(activity);
        } catch (error) {
            console.error(
                "Error fetching audit logs:",
                error
            );

            setError(
                error?.message ||
                    "Failed to load audit logs"
            );
        } finally {
            setIsLoading(false);
        }
    }

    const handleSearch = (query) => {
        setSearchQuery(query);
        filterLogs(query, filterAction);
    };

    const handleFilter = (action) => {
        setFilterAction(action);
        filterLogs(searchQuery, action);
    };

    const filterLogs = (query, action) => {
        let filtered = [...logs];

        const normalizedQuery =
            query.trim().toLowerCase();

        if (normalizedQuery) {
            filtered = filtered.filter((log) => {
                const actionName =
                    log.action?.toLowerCase() || "";

                const userName =
                    log.userId?.name?.toLowerCase() || "";

                const userEmail =
                    log.userId?.email?.toLowerCase() || "";

                const entityType =
                    log.entityType?.toLowerCase() || "";

                return (
                    actionName.includes(normalizedQuery) ||
                    userName.includes(normalizedQuery) ||
                    userEmail.includes(normalizedQuery) ||
                    entityType.includes(normalizedQuery)
                );
            });
        }

        if (action !== "all") {
            filtered = filtered.filter(
                (log) => log.action === action
            );
        }

        setFilteredLogs(filtered);
    };

    const getActionColor = (action) => {
        const colors = {
            LOGIN:
                "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",

            LOGOUT:
                "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400",

            REGISTER:
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",

            CREATE_CAMPAIGN:
                "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",

            UPDATE_CAMPAIGN:
                "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",

            DELETE_CAMPAIGN:
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",

            CREATE_BOOKING:
                "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400",

            UPDATE_BOOKING:
                "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",

            APPROVE_COMPANY:
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",

            REJECT_COMPANY:
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",

            APPROVE_STATION:
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",

            REJECT_STATION:
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",

            SUSPEND_USER:
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",

            ACTIVATE_USER:
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",

            INVITE_EMPLOYEE:
                "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",

            UPDATE_EMPLOYEE_ROLE:
                "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",

            REMOVE_EMPLOYEE:
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",

            CREATE_COMPANY:
                "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",

            UPDATE_COMPANY:
                "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",

            UPLOAD_CREATIVE:
                "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400",
        };

        return (
            colors[action] ||
            "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400"
        );
    };

    const getActionIcon = (action) => {
        if (
            action?.includes("DELETE") ||
            action?.includes("REJECT") ||
            action?.includes("REMOVE") ||
            action === "SUSPEND_USER"
        ) {
            return <XCircle className="h-3.5 w-3.5" />;
        }

        if (
            action?.includes("APPROVE") ||
            action?.includes("ACTIVATE") ||
            action?.includes("CREATE") ||
            action === "REGISTER"
        ) {
            return (
                <CheckCircle className="h-3.5 w-3.5" />
            );
        }

        if (
            action === "LOGIN" ||
            action === "LOGOUT"
        ) {
            return <ShieldCheck className="h-3.5 w-3.5" />;
        }

        return <Activity className="h-3.5 w-3.5" />;
    };

    const formatAction = (action) => {
        if (!action) return "Unknown";

        return action
            .toLowerCase()
            .replace(/_/g, " ")
            .replace(/\b\w/g, (letter) =>
                letter.toUpperCase()
            );
    };

    const formatEntity = (entity) => {
        if (!entity) return "Unknown";

        return entity
            .replace(/_/g, " ")
            .replace(/\b\w/g, (letter) =>
                letter.toUpperCase()
            );
    };

    const formatDate = (date) => {
        if (!date) return "N/A";

        const parsedDate = new Date(date);

        if (Number.isNaN(parsedDate.getTime())) {
            return "N/A";
        }

        return parsedDate.toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const formatMetadataValue = (value) => {
        if (value === null || value === undefined) {
            return "-";
        }

        if (typeof value === "object") {
            return JSON.stringify(value);
        }

        return String(value);
    };

    const getUserInitials = (name) => {
        if (!name) return "SY";

        const parts = name
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (parts.length === 1) {
            return parts[0]
                .slice(0, 2)
                .toUpperCase();
        }

        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    };

    const actionOptions = [
        { value: "all", label: "All" },
        { value: "LOGIN", label: "Login" },
        { value: "LOGOUT", label: "Logout" },
        { value: "REGISTER", label: "Register" },
        {
            value: "CREATE_CAMPAIGN",
            label: "Create Campaign",
        },
        {
            value: "UPDATE_CAMPAIGN",
            label: "Update Campaign",
        },
        {
            value: "DELETE_CAMPAIGN",
            label: "Delete Campaign",
        },
        {
            value: "CREATE_BOOKING",
            label: "Create Booking",
        },
        {
            value: "UPDATE_BOOKING",
            label: "Update Booking",
        },
        {
            value: "APPROVE_COMPANY",
            label: "Approve Company",
        },
        {
            value: "REJECT_COMPANY",
            label: "Reject Company",
        },
        {
            value: "APPROVE_STATION",
            label: "Approve Station",
        },
        {
            value: "REJECT_STATION",
            label: "Reject Station",
        },
        {
            value: "SUSPEND_USER",
            label: "Suspend User",
        },
        {
            value: "ACTIVATE_USER",
            label: "Activate User",
        },
        {
            value: "INVITE_EMPLOYEE",
            label: "Invite Employee",
        },
        {
            value: "UPDATE_EMPLOYEE_ROLE",
            label: "Update Employee Role",
        },
        {
            value: "REMOVE_EMPLOYEE",
            label: "Remove Employee",
        },
        {
            value: "CREATE_COMPANY",
            label: "Create Company",
        },
        {
            value: "UPDATE_COMPANY",
            label: "Update Company",
        },
        {
            value: "UPLOAD_CREATIVE",
            label: "Upload Creative",
        },
    ];

    const visibleActionOptions = actionOptions.slice(0, 8);

    const uniqueActions = new Set(
        logs.map((log) => log.action).filter(Boolean)
    ).size;

    const uniqueUsers = new Set(
        logs
            .map((log) => log.userId?._id)
            .filter(Boolean)
    ).size;

    const mostActiveUser =
        logs.length > 0
            ? Object.entries(
                  logs.reduce((acc, log) => {
                      const name =
                          log.userId?.name || "System";

                      acc[name] = (acc[name] || 0) + 1;

                      return acc;
                  }, {})
              ).sort((a, b) => b[1] - a[1])[0]?.[0] || "-"
            : "-";

    const stats = [
        {
            label: "Entries shown",
            value: logs.length,
            icon: FileText,
            iconClass:
                "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        },
        {
            label: "Unique actions",
            value: uniqueActions,
            icon: Activity,
            iconClass:
                "bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
        },
        {
            label: "Unique users",
            value: uniqueUsers,
            icon: Users,
            iconClass:
                "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
        },
        {
            label: "Most active",
            value: mostActiveUser,
            icon: User,
            iconClass:
                "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
        },
    ];

    if (isLoading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-3"
                >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                    </div>

                    <p className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
                        Loading audit logs…
                    </p>
                </motion.div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-md px-4 text-center"
                >
                    <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-500/10">
                        <XCircle className="h-6 w-6 text-red-500" />
                    </div>

                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Failed to load audit logs
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {error}
                    </p>

                    <button
                        onClick={fetchAuditLogs}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Retry
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="pb-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"
            >
                <div>
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-500">
                        <FileText className="h-4 w-4" />
                        System activity
                    </div>

                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                        Recent activity
                    </h1>

                    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                        The 10 most recent actions on the platform. A full,
                        searchable audit log isn&apos;t available yet.
                    </p>
                </div>

                <button
                    onClick={fetchAuditLogs}
                    className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                    title="Refresh audit logs"
                >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </button>
            </motion.div>

            {/* Stats */}
            <motion.div
                initial="hidden"
                animate="show"
                variants={{
                    hidden: {},
                    show: {
                        transition: {
                            staggerChildren: 0.06,
                        },
                    },
                }}
                className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4"
            >
                {stats.map((stat) => {
                    const Icon = stat.icon;

                    return (
                        <motion.div
                            key={stat.label}
                            variants={{
                                hidden: {
                                    opacity: 0,
                                    y: 8,
                                },
                                show: {
                                    opacity: 1,
                                    y: 0,
                                },
                            }}
                            className="group min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400 dark:text-slate-500">
                                        {stat.label}
                                    </p>

                                    <p
                                        className={`mt-2 truncate font-semibold tracking-tight text-slate-900 dark:text-white ${
                                            stat.label ===
                                            "Most active"
                                                ? "text-sm"
                                                : "text-2xl"
                                        }`}
                                        title={
                                            stat.label ===
                                            "Most active"
                                                ? String(
                                                      stat.value
                                                  )
                                                : undefined
                                        }
                                    >
                                        {stat.value}
                                    </p>
                                </div>

                                <div
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${stat.iconClass}`}
                                >
                                    <Icon className="h-4 w-4" />
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* Filters */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <input
                            type="text"
                            placeholder="Search by action, user, email or entity..."
                            value={searchQuery}
                            onChange={(event) =>
                                handleSearch(
                                    event.target.value
                                )
                            }
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-950"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        {visibleActionOptions.map(
                            (option) => {
                                const isActive =
                                    filterAction ===
                                    option.value;

                                return (
                                    <button
                                        key={
                                            option.value
                                        }
                                        onClick={() =>
                                            handleFilter(
                                                option.value
                                            )
                                        }
                                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                                            isActive
                                                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                                                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                        }`}
                                    >
                                        {
                                            option.label
                                        }
                                    </button>
                                );
                            }
                        )}

                        <span className="px-2 text-xs font-medium text-slate-400 dark:text-slate-600">
                            + more
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* Results Meta */}
            <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                    Showing{" "}
                    <span className="text-slate-600 dark:text-slate-300">
                        {filteredLogs.length}
                    </span>{" "}
                    of{" "}
                    <span className="text-slate-600 dark:text-slate-300">
                        {logs.length}
                    </span>{" "}
                    activity records
                </p>

                {searchQuery && (
                    <button
                        onClick={() =>
                            handleSearch("")
                        }
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                        Clear search
                    </button>
                )}
            </div>

            {/* Audit Table */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px]">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/60">
                                <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    Action
                                </th>

                                <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    User
                                </th>

                                <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    Entity
                                </th>

                                <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    Details
                                </th>

                                <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    Time
                                </th>

                                <th className="px-5 py-3.5 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    View
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="6"
                                        className="px-5 py-16"
                                    >
                                        <div className="flex flex-col items-center justify-center text-center">
                                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                                                <FileText className="h-5 w-5 text-slate-400" />
                                            </div>

                                            <p className="font-medium text-slate-700 dark:text-slate-300">
                                                No audit logs found
                                            </p>

                                            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
                                                Try adjusting your
                                                search or selecting
                                                another action.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map(
                                    (log, index) => {
                                        const userName =
                                            log.userId
                                                ?.name ||
                                            "System";

                                        const metadata =
                                            log.metadata
                                                ? Object.entries(
                                                      log.metadata
                                                  )
                                                : [];

                                        return (
                                            <motion.tr
                                                key={
                                                    log._id
                                                }
                                                initial={{
                                                    opacity: 0,
                                                    y: 6,
                                                }}
                                                animate={{
                                                    opacity: 1,
                                                    y: 0,
                                                }}
                                                transition={{
                                                    delay:
                                                        index *
                                                        0.025,
                                                }}
                                                className="group cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                                                onClick={() =>
                                                    setSelectedLog(
                                                        log
                                                    )
                                                }
                                            >
                                                {/* Action */}
                                                <td className="px-5 py-4">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold ${getActionColor(
                                                            log.action
                                                        )}`}
                                                    >
                                                        {getActionIcon(
                                                            log.action
                                                        )}

                                                        {formatAction(
                                                            log.action
                                                        )}
                                                    </span>
                                                </td>

                                                {/* User */}
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                            {getUserInitials(
                                                                userName
                                                            )}
                                                        </div>

                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                                {
                                                                    userName
                                                                }
                                                            </p>

                                                            <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-slate-400">
                                                                {log
                                                                    .userId
                                                                    ?.email ||
                                                                    "System activity"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Entity */}
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                                                            <Database className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                                                        </div>

                                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                                            {formatEntity(
                                                                log.entityType
                                                            )}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Details */}
                                                <td className="max-w-xs px-5 py-4">
                                                    {metadata.length >
                                                    0 ? (
                                                        <div className="max-w-[280px] truncate">
                                                            {metadata
                                                                .slice(
                                                                    0,
                                                                    2
                                                                )
                                                                .map(
                                                                    ([
                                                                        key,
                                                                        value,
                                                                    ]) => (
                                                                        <span
                                                                            key={
                                                                                key
                                                                            }
                                                                            className="mr-2 inline"
                                                                        >
                                                                            <span className="text-[10px] text-slate-400">
                                                                                {
                                                                                    key
                                                                                }
                                                                                :
                                                                            </span>{" "}
                                                                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                                                                {formatMetadataValue(
                                                                                    value
                                                                                )}
                                                                            </span>
                                                                        </span>
                                                                    )
                                                                )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-slate-400">
                                                            No metadata
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Time */}
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />

                                                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                                            {formatDate(
                                                                log.createdAt
                                                            )}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* View */}
                                                <td className="px-5 py-4 text-right">
                                                    <button
                                                        onClick={(
                                                            event
                                                        ) => {
                                                            event.stopPropagation();

                                                            setSelectedLog(
                                                                log
                                                            );
                                                        }}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-400 transition-all hover:border-slate-200 hover:bg-white hover:text-slate-700 hover:shadow-sm dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                                        title="View details"
                                                    >
                                                        <EyeIcon />
                                                    </button>
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

            {/* Details Modal */}
            <AnimatePresence>
                {selectedLog && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-md"
                        onClick={(event) => {
                            if (
                                event.target ===
                                event.currentTarget
                            ) {
                                setSelectedLog(null);
                            }
                        }}
                    >
                        <motion.div
                            initial={{
                                opacity: 0,
                                y: 16,
                                scale: 0.98,
                            }}
                            animate={{
                                opacity: 1,
                                y: 0,
                                scale: 1,
                            }}
                            exit={{
                                opacity: 0,
                                y: 12,
                                scale: 0.98,
                            }}
                            transition={{
                                duration: 0.2,
                            }}
                            className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                        >
                            {/* Modal Header */}
                            <div className="border-b border-slate-200 px-5 py-5 dark:border-slate-800 sm:px-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {getUserInitials(
                                                selectedLog
                                                    .userId
                                                    ?.name ||
                                                    "System"
                                            )}
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-500">
                                                Activity details
                                            </p>

                                            <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                                                {formatAction(
                                                    selectedLog.action
                                                )}
                                            </h3>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() =>
                                            setSelectedLog(
                                                null
                                            )
                                        }
                                        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                        title="Close"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                <div className="mt-4">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold ${getActionColor(
                                            selectedLog.action
                                        )}`}
                                    >
                                        {getActionIcon(
                                            selectedLog.action
                                        )}

                                        {formatAction(
                                            selectedLog.action
                                        )}
                                    </span>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="max-h-[calc(90vh-150px)] overflow-y-auto px-5 py-5 sm:px-6">
                                <div className="space-y-5">
                                    {/* Basic Information */}
                                    <div>
                                        <SectionLabel label="Activity information" />

                                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <DetailCard
                                                icon={User}
                                                label="User"
                                                value={
                                                    selectedLog
                                                        .userId
                                                        ?.name ||
                                                    "System"
                                                }
                                            />

                                            <DetailCard
                                                icon={Database}
                                                label="Entity"
                                                value={formatEntity(
                                                    selectedLog.entityType
                                                )}
                                            />

                                            <DetailCard
                                                icon={Calendar}
                                                label="Date"
                                                value={formatDate(
                                                    selectedLog.createdAt
                                                )}
                                            />

                                            <DetailCard
                                                icon={Activity}
                                                label="Action"
                                                value={formatAction(
                                                    selectedLog.action
                                                )}
                                            />
                                        </div>
                                    </div>

                                    {/* Email */}
                                    {selectedLog.userId
                                        ?.email && (
                                        <div>
                                            <SectionLabel label="User email" />

                                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    {
                                                        selectedLog
                                                            .userId
                                                            .email
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Metadata */}
                                    <div>
                                        <SectionLabel label="Metadata" />

                                        {selectedLog.metadata &&
                                        Object.keys(
                                            selectedLog.metadata
                                        ).length > 0 ? (
                                            <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                                                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                                    {Object.entries(
                                                        selectedLog.metadata
                                                    ).map(
                                                        ([
                                                            key,
                                                            value,
                                                        ]) => (
                                                            <div
                                                                key={
                                                                    key
                                                                }
                                                                className="grid grid-cols-1 gap-1 bg-white px-4 py-3 sm:grid-cols-[150px_1fr] sm:gap-4 dark:bg-slate-900"
                                                            >
                                                                <span className="text-xs font-semibold capitalize text-slate-400">
                                                                    {key.replace(
                                                                        /_/g,
                                                                        " "
                                                                    )}
                                                                </span>

                                                                <span className="break-words text-sm font-medium text-slate-700 dark:text-slate-300">
                                                                    {formatMetadataValue(
                                                                        value
                                                                    )}
                                                                </span>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                                                <p className="text-sm text-slate-400">
                                                    No metadata was recorded
                                                    for this activity.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function SectionLabel({ label }) {
    return (
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {label}
        </p>
    );
}

function DetailCard({ icon: Icon, label, value }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Icon className="h-4 w-4" />

                <span className="text-[10px] font-bold uppercase tracking-[0.12em]">
                    {label}
                </span>
            </div>

            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                {value}
            </p>
        </div>
    );
}

function EyeIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4"
        >
            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}