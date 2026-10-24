"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Users,
    Search,
    CheckCircle,
    XCircle,
    Eye,
    Loader2,
    Calendar,
    Clock,
    Building2,
    User,
    Shield,
    Briefcase,
    UserCheck,
    UserX,
    Radio,
    Mail,
    Activity,
    ChevronDown,
    X,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminUsersPage() {
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterType, setFilterType] = useState("all");
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
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

            fetchUsers();
        } catch {
            router.push("/login");
        }
    }, [router]);

    async function fetchUsers() {
        try {
            setError(null);

            const token = localStorage.getItem("token");

            const response = await fetch(`${API_URL}/api/v1/admin/users`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to load users");
            }

            setUsers(result.data);
            setFilteredUsers(result.data);
        } catch (error) {
            console.error("Error fetching users:", error);
            setError(error.message);
        } finally {
            setIsLoading(false);
        }
    }

    const handleSearch = (query) => {
        setSearchQuery(query);
        filterUsers(query, filterStatus, filterType);
    };

    const handleFilter = (status) => {
        setFilterStatus(status);
        filterUsers(searchQuery, status, filterType);
    };

    const handleTypeFilter = (type) => {
        setFilterType(type);
        filterUsers(searchQuery, filterStatus, type);
    };

    const filterUsers = (query, status, type) => {
        let filtered = users;

        if (query) {
            const normalizedQuery = query.toLowerCase();

            filtered = filtered.filter(
                (u) =>
                    u.name?.toLowerCase().includes(normalizedQuery) ||
                    u.email?.toLowerCase().includes(normalizedQuery)
            );
        }

        if (status !== "all") {
            filtered = filtered.filter((u) => u.status === status);
        }

        if (type !== "all") {
            filtered = filtered.filter((u) => u.accountType === type);
        }

        setFilteredUsers(filtered);
    };

    const handleSuspend = async (id) => {
        if (!confirm("Are you sure you want to suspend this user?")) return;

        setActionLoading(id);

        try {
            const token = localStorage.getItem("token");

            const response = await fetch(
                `${API_URL}/api/v1/admin/users/${id}/suspend`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to suspend user");
            }

            await fetchUsers();
        } catch (error) {
            console.error("Error suspending user:", error);
            alert(error.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleActivate = async (id) => {
        setActionLoading(id);

        try {
            const token = localStorage.getItem("token");

            const response = await fetch(
                `${API_URL}/api/v1/admin/users/${id}/activate`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to activate user");
            }

            await fetchUsers();
        } catch (error) {
            console.error("Error activating user:", error);
            alert(error.message);
        } finally {
            setActionLoading(null);
        }
    };

    const getTypeColor = (type) => {
        const colors = {
            INDIVIDUAL:
                "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
            COMPANY:
                "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
            ADMIN:
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
            EMPLOYEE:
                "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
            STATION:
                "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400",
        };

        return (
            colors[type] ||
            "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400"
        );
    };

    const getTypeIcon = (type, size = "h-3 w-3") => {
        const icons = {
            INDIVIDUAL: <User className={size} />,
            COMPANY: <Building2 className={size} />,
            ADMIN: <Shield className={size} />,
            EMPLOYEE: <Briefcase className={size} />,
            STATION: <Radio className={size} />,
        };

        return icons[type] || <User className={size} />;
    };

    const getStatusColor = (status) => {
        const colors = {
            ACTIVE:
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
            PENDING:
                "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400",
            SUSPENDED:
                "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
            DEACTIVATED:
                "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400",
        };

        return (
            colors[status] ||
            "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400"
        );
    };

    const getStatusIcon = (status, size = "h-3 w-3") => {
        const icons = {
            ACTIVE: <CheckCircle className={size} />,
            PENDING: <Clock className={size} />,
            SUSPENDED: <XCircle className={size} />,
            DEACTIVATED: <Clock className={size} />,
        };

        return icons[status] || null;
    };

    const getInitials = (name) => {
        if (!name) return "U";

        return name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("");
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
        { value: "ACTIVE", label: "Active" },
        { value: "PENDING", label: "Pending" },
        { value: "SUSPENDED", label: "Suspended" },
        { value: "DEACTIVATED", label: "Deactivated" },
    ];

    const typeOptions = [
        { value: "all", label: "All Types" },
        { value: "INDIVIDUAL", label: "Individual" },
        { value: "COMPANY", label: "Company" },
        { value: "EMPLOYEE", label: "Employee" },
        { value: "ADMIN", label: "Admin" },
        { value: "STATION", label: "Station" },
    ];

    const stats = {
        total: users.length,
        active: users.filter((u) => u.status === "ACTIVE").length,
        pending: users.filter((u) => u.status === "PENDING").length,
        suspended: users.filter((u) => u.status === "SUSPENDED").length,
        individual: users.filter((u) => u.accountType === "INDIVIDUAL").length,
        company: users.filter((u) => u.accountType === "COMPANY").length,
        employee: users.filter((u) => u.accountType === "EMPLOYEE").length,
        admin: users.filter((u) => u.accountType === "ADMIN").length,
    };

    const statCards = [
        {
            label: "Total Users",
            value: stats.total,
            icon: Users,
            iconClass:
                "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        },
        {
            label: "Active",
            value: stats.active,
            icon: UserCheck,
            iconClass:
                "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
        },
        {
            label: "Pending",
            value: stats.pending,
            icon: Clock,
            iconClass:
                "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-400",
        },
        {
            label: "Suspended",
            value: stats.suspended,
            icon: UserX,
            iconClass:
                "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
        },
    ];

    const typeStats = [
        {
            label: "Individual",
            value: stats.individual,
            icon: User,
            className:
                "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200/70 dark:border-blue-500/20",
        },
        {
            label: "Company",
            value: stats.company,
            icon: Building2,
            className:
                "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-200/70 dark:border-purple-500/20",
        },
        {
            label: "Employee",
            value: stats.employee,
            icon: Briefcase,
            className:
                "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border-orange-200/70 dark:border-orange-500/20",
        },
        {
            label: "Admin",
            value: stats.admin,
            icon: Shield,
            className:
                "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/70 dark:border-emerald-500/20",
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
                        Loading users...
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
                        Unable to load users
                    </h2>

                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        {error}
                    </p>

                    <button
                        onClick={fetchUsers}
                        className="mt-6 inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98]"
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
                                    <Users className="h-4 w-4" />
                                </div>

                                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
                                    User Management
                                </span>
                            </div>

                            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                                Users
                            </h1>

                            <p className="mt-1.5 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                                Manage accounts, monitor activity, and control
                                platform access.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <Activity className="h-4 w-4 text-emerald-500" />

                            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                {filteredUsers.length}{" "}
                                {filteredUsers.length === 1 ? "user" : "users"}{" "}
                                shown
                            </span>
                        </div>
                    </div>
                </motion.div>

                {/* Main Stats */}
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

                {/* Account Type Stats */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4"
                >
                    {typeStats.map((stat) => {
                        const Icon = stat.icon;

                        return (
                            <div
                                key={stat.label}
                                className={`rounded-xl border px-4 py-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm ${stat.className}`}
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] opacity-80">
                                            {stat.label}
                                        </p>

                                        <p className="mt-1 text-xl font-semibold">
                                            {stat.value}
                                        </p>
                                    </div>

                                    <Icon className="h-4 w-4 opacity-60" />
                                </div>
                            </div>
                        );
                    })}
                </motion.div>

                {/* Search + Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="mb-5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900"
                >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        {/* Search */}
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                            <input
                                type="text"
                                placeholder="Search users by name or email..."
                                value={searchQuery}
                                onChange={(e) =>
                                    handleSearch(e.target.value)
                                }
                                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
                            />
                        </div>

                        {/* Type Filter */}
                        <div className="relative">
                            <select
                                value={filterType}
                                onChange={(e) =>
                                    handleTypeFilter(e.target.value)
                                }
                                className="h-11 w-full min-w-[150px] appearance-none rounded-xl border border-slate-200 bg-slate-50/70 pl-4 pr-10 text-sm font-medium text-slate-600 outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:focus:bg-slate-800"
                            >
                                {typeOptions.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>

                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                    </div>

                    {/* Status Filters */}
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

                {/* Users Table */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900"
                >
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Platform Users
                            </h2>

                            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                {filteredUsers.length} matching{" "}
                                {filteredUsers.length === 1
                                    ? "account"
                                    : "accounts"}
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
                        <table className="w-full min-w-[820px]">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40">
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        User
                                    </th>

                                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Type
                                    </th>

                                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Status
                                    </th>

                                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Activity
                                    </th>

                                    <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Joined
                                    </th>

                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Actions
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan="6"
                                            className="px-5 py-16 text-center"
                                        >
                                            <div className="mx-auto flex max-w-sm flex-col items-center">
                                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                                                    <Users className="h-5 w-5" />
                                                </div>

                                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                    No users found
                                                </p>

                                                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                                    Try adjusting your search or
                                                    filters.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((user, index) => (
                                        <motion.tr
                                            key={user._id}
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
                                                    index * 0.025,
                                                    0.3
                                                ),
                                            }}
                                            className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                                        >
                                            {/* User */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-600 ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                                                        {getInitials(
                                                            user.name
                                                        )}
                                                    </div>

                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                                            {user.name ||
                                                                "Unknown"}
                                                        </p>

                                                        <div className="mt-0.5 flex items-center gap-1.5">
                                                            <Mail className="h-3 w-3 shrink-0 text-slate-400" />

                                                            <p className="max-w-[260px] truncate text-xs text-slate-400 dark:text-slate-500">
                                                                {user.email}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Type */}
                                            <td className="px-4 py-4">
                                                <span
                                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${getTypeColor(
                                                        user.accountType
                                                    )}`}
                                                >
                                                    {getTypeIcon(
                                                        user.accountType
                                                    )}

                                                    {user.accountType}
                                                </span>
                                            </td>

                                            {/* Status */}
                                            <td className="px-4 py-4">
                                                <span
                                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${getStatusColor(
                                                        user.status
                                                    )}`}
                                                >
                                                    {getStatusIcon(
                                                        user.status
                                                    )}

                                                    {user.status}
                                                </span>
                                            </td>

                                            {/* Activity */}
                                            <td className="px-4 py-4">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                                        {user.loginCount || 0}{" "}
                                                        <span className="font-normal text-slate-400">
                                                            logins
                                                        </span>
                                                    </p>

                                                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                                                        {user.lastLogin
                                                            ? `Last: ${formatDate(
                                                                  user.lastLogin
                                                              )}`
                                                            : "Never logged in"}
                                                    </p>
                                                </div>
                                            </td>

                                            {/* Joined */}
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                                    {formatDate(
                                                        user.createdAt
                                                    )}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedUser(
                                                                user
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

                                                    {user.status ===
                                                        "ACTIVE" &&
                                                        user.accountType !==
                                                            "ADMIN" && (
                                                            <button
                                                                onClick={() =>
                                                                    handleSuspend(
                                                                        user._id
                                                                    )
                                                                }
                                                                disabled={
                                                                    actionLoading ===
                                                                    user._id
                                                                }
                                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition-all hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-500/10"
                                                                title="Suspend"
                                                            >
                                                                {actionLoading ===
                                                                user._id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <UserX className="h-4 w-4" />
                                                                )}
                                                            </button>
                                                        )}

                                                    {user.status ===
                                                        "SUSPENDED" && (
                                                        <button
                                                            onClick={() =>
                                                                handleActivate(
                                                                    user._id
                                                                )
                                                            }
                                                            disabled={
                                                                actionLoading ===
                                                                user._id
                                                            }
                                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-500 transition-all hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-emerald-500/10"
                                                            title="Activate"
                                                        >
                                                            {actionLoading ===
                                                            user._id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <UserCheck className="h-4 w-4" />
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            </div>

            {/* User Details Modal */}
            <AnimatePresence>
                {showDetails && selectedUser && (
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
                                    <div className="flex items-center gap-3.5">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                                            {getInitials(
                                                selectedUser.name
                                            )}
                                        </div>

                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                                                    {selectedUser.name ||
                                                        "Unknown"}
                                                </h3>

                                                <span
                                                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${getStatusColor(
                                                        selectedUser.status
                                                    )}`}
                                                >
                                                    {getStatusIcon(
                                                        selectedUser.status
                                                    )}

                                                    {selectedUser.status}
                                                </span>
                                            </div>

                                            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                                {selectedUser.email}
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

                            {/* Modal Content */}
                            <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {/* Account Type */}
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                            Account Type
                                        </p>

                                        <div className="mt-2">
                                            <span
                                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${getTypeColor(
                                                    selectedUser.accountType
                                                )}`}
                                            >
                                                {getTypeIcon(
                                                    selectedUser.accountType
                                                )}

                                                {selectedUser.accountType}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                            Account Status
                                        </p>

                                        <div className="mt-2">
                                            <span
                                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${getStatusColor(
                                                    selectedUser.status
                                                )}`}
                                            >
                                                {getStatusIcon(
                                                    selectedUser.status
                                                )}

                                                {selectedUser.status}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Login Count */}
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                            Login Count
                                        </p>

                                        <div className="mt-2 flex items-center gap-2">
                                            <Activity className="h-4 w-4 text-emerald-500" />

                                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                {selectedUser.loginCount ||
                                                    0}
                                            </span>

                                            <span className="text-xs text-slate-400">
                                                logins
                                            </span>
                                        </div>
                                    </div>

                                    {/* Last Login */}
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                            Last Login
                                        </p>

                                        <div className="mt-2 flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-slate-400" />

                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                                {selectedUser.lastLogin
                                                    ? formatDate(
                                                          selectedUser.lastLogin
                                                      )
                                                    : "Never"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Contact */}
                                <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                        Account Information
                                    </p>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2.5">
                                                <Mail className="h-4 w-4 text-slate-400" />

                                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                                    Email
                                                </span>
                                            </div>

                                            <span className="truncate text-right text-xs font-medium text-slate-700 dark:text-slate-200">
                                                {selectedUser.email}
                                            </span>
                                        </div>

                                        {selectedUser.companyId && (
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-2.5">
                                                    <Building2 className="h-4 w-4 text-slate-400" />

                                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                                        Company ID
                                                    </span>
                                                </div>

                                                <span className="max-w-[55%] truncate text-right text-xs font-medium text-slate-700 dark:text-slate-200">
                                                    {selectedUser.companyId}
                                                </span>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2.5">
                                                <Calendar className="h-4 w-4 text-slate-400" />

                                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                                    Joined
                                                </span>
                                            </div>

                                            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                                {formatDate(
                                                    selectedUser.createdAt
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* State Message */}
                                {selectedUser.status === "SUSPENDED" && (
                                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
                                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />

                                        <div>
                                            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                                                Account suspended
                                            </p>

                                            <p className="mt-0.5 text-xs text-red-600/80 dark:text-red-400/70">
                                                This user currently does not
                                                have active platform access.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {selectedUser.status === "PENDING" && (
                                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-500/20 dark:bg-yellow-500/10">
                                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />

                                        <div>
                                            <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                                                Pending activation
                                            </p>

                                            <p className="mt-0.5 text-xs text-yellow-600/80 dark:text-yellow-400/70">
                                                This account is awaiting
                                                activation.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Actions */}
                            <div className="border-t border-slate-100 px-6 py-4 dark:border-slate-800">
                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <button
                                        onClick={() =>
                                            setShowDetails(false)
                                        }
                                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        Close
                                    </button>

                                    {selectedUser.status === "ACTIVE" &&
                                        selectedUser.accountType !==
                                            "ADMIN" && (
                                            <button
                                                onClick={() => {
                                                    handleSuspend(
                                                        selectedUser._id
                                                    );
                                                    setShowDetails(false);
                                                }}
                                                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-500/20 transition-all hover:bg-red-600 active:scale-[0.98]"
                                            >
                                                Suspend User
                                            </button>
                                        )}

                                    {selectedUser.status ===
                                        "SUSPENDED" && (
                                        <button
                                            onClick={() => {
                                                handleActivate(
                                                    selectedUser._id
                                                );
                                                setShowDetails(false);
                                            }}
                                            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98]"
                                        >
                                            Activate User
                                        </button>
                                    )}

                                    {selectedUser.status === "PENDING" &&
                                        selectedUser.accountType !==
                                            "ADMIN" && (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        handleSuspend(
                                                            selectedUser._id
                                                        );
                                                        setShowDetails(false);
                                                    }}
                                                    className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-500/20 transition-all hover:bg-red-600 active:scale-[0.98]"
                                                >
                                                    Reject User
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        handleActivate(
                                                            selectedUser._id
                                                        );
                                                        setShowDetails(false);
                                                    }}
                                                    className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98]"
                                                >
                                                    Activate User
                                                </button>
                                            </>
                                        )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}