"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    Users,
    Building2,
    Radio,
    BarChart3,
    CreditCard,
    Clock,
    CheckCircle,
    XCircle,
    Loader2,
    Sparkles,
    ArrowUpRight,
    Activity,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminDashboardPage() {
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem("token");
        const userData = localStorage.getItem("user");

        if (!token || !userData) {
            router.push("/login");
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsLoading(false);
            return;
        }

        try {
            const user = JSON.parse(userData);

            if (user.accountType !== "ADMIN") {
                router.push("/dashboard");
                setIsLoading(false);
                return;
            }

            fetchDashboardData();
        } catch {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            router.push("/login");
        }
    }, [router]);

    async function fetchDashboardData() {
        try {
            setError(null);

            const token = localStorage.getItem("token");

            const response = await fetch(
                `${API_URL}/api/v1/admin/dashboard`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message || "Failed to load dashboard"
                );
            }

            setData(result.data);
        } catch (error) {
            console.error("Error fetching dashboard:", error);
            setError(error.message);
        } finally {
            setIsLoading(false);
        }
    }

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center"
                >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                    </div>

                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Loading dashboard
                    </p>
                </motion.div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
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
                        onClick={fetchDashboardData}
                        className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md active:scale-[0.98]"
                    >
                        Try again
                    </button>
                </motion.div>
            </div>
        );
    }

    const stats = data?.stats || {
        totalUsers: 0,
        totalCompanies: 0,
        totalStations: 0,
        totalCampaigns: 0,
        totalBookings: 0,
        totalPayments: 0,
        totalRevenue: 0,
        pendingCompanies: 0,
        pendingStations: 0,
    };

    const recentActivity = data?.recentActivity || [];

    const formatCurrency = (amount) => {
        const value = Number(amount) || 0;

        const numberPart = new Intl.NumberFormat("en-NG", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);

        return {
            symbol: "₦",
            number: numberPart,
        };
    };

    const formatDate = (date) => {
        if (!date) return "";

        return new Date(date).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const getActionIcon = (action) => {
        const iconMap = {
            LOGIN: {
                icon: Clock,
                className: "text-blue-500",
                background:
                    "bg-blue-50 dark:bg-blue-500/10",
            },

            LOGOUT: {
                icon: Clock,
                className: "text-slate-500",
                background:
                    "bg-slate-100 dark:bg-slate-800",
            },

            APPROVE_COMPANY: {
                icon: CheckCircle,
                className: "text-emerald-500",
                background:
                    "bg-emerald-50 dark:bg-emerald-500/10",
            },

            REJECT_COMPANY: {
                icon: XCircle,
                className: "text-red-500",
                background:
                    "bg-red-50 dark:bg-red-500/10",
            },

            APPROVE_STATION: {
                icon: CheckCircle,
                className: "text-emerald-500",
                background:
                    "bg-emerald-50 dark:bg-emerald-500/10",
            },

            REJECT_STATION: {
                icon: XCircle,
                className: "text-red-500",
                background:
                    "bg-red-50 dark:bg-red-500/10",
            },

            SUSPEND_USER: {
                icon: XCircle,
                className: "text-red-500",
                background:
                    "bg-red-50 dark:bg-red-500/10",
            },

            ACTIVATE_USER: {
                icon: CheckCircle,
                className: "text-emerald-500",
                background:
                    "bg-emerald-50 dark:bg-emerald-500/10",
            },

            INVITE_EMPLOYEE: {
                icon: Users,
                className: "text-blue-500",
                background:
                    "bg-blue-50 dark:bg-blue-500/10",
            },

            CREATE_CAMPAIGN: {
                icon: BarChart3,
                className: "text-purple-500",
                background:
                    "bg-purple-50 dark:bg-purple-500/10",
            },

            CREATE_BOOKING: {
                icon: CreditCard,
                className: "text-orange-500",
                background:
                    "bg-orange-50 dark:bg-orange-500/10",
            },
        };

        const config = iconMap[action] || {
            icon: Activity,
            className: "text-slate-400",
            background:
                "bg-slate-100 dark:bg-slate-800",
        };

        const Icon = config.icon;

        return {
            Icon,
            className: config.className,
            background: config.background,
        };
    };

    const statCards = [
        {
            label: "Total Users",
            value: stats.totalUsers,
            icon: Users,
            color: "bg-blue-50 dark:bg-blue-500/10",
            iconColor: "text-blue-500",
        },
        {
            label: "Companies",
            value: stats.totalCompanies,
            icon: Building2,
            color: "bg-purple-50 dark:bg-purple-500/10",
            iconColor: "text-purple-500",
        },
        {
            label: "Stations",
            value: stats.totalStations,
            icon: Radio,
            color: "bg-emerald-50 dark:bg-emerald-500/10",
            iconColor: "text-emerald-500",
        },
        {
            label: "Total Revenue",
            value: `${formatCurrency(stats.totalRevenue).symbol}${formatCurrency(stats.totalRevenue).number}`,
            icon: CreditCard,
            color: "bg-orange-50 dark:bg-orange-500/10",
            iconColor: "text-orange-500",
            featured: true,
        },
        {
            label: "Pending Companies",
            value: stats.pendingCompanies,
            icon: Building2,
            color: "bg-yellow-50 dark:bg-yellow-500/10",
            iconColor: "text-yellow-500",
        },
        {
            label: "Pending Stations",
            value: stats.pendingStations,
            icon: Radio,
            color: "bg-red-50 dark:bg-red-500/10",
            iconColor: "text-red-500",
        },
        {
            label: "Campaigns",
            value: stats.totalCampaigns,
            icon: BarChart3,
            color: "bg-indigo-50 dark:bg-indigo-500/10",
            iconColor: "text-indigo-500",
        },
        {
            label: "Bookings",
            value: stats.totalBookings,
            icon: CreditCard,
            color: "bg-pink-50 dark:bg-pink-500/10",
            iconColor: "text-pink-500",
        },
    ];

    return (
        <div className="min-h-screen bg-slate-50/80 dark:bg-slate-950">
            <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="mb-8"
                >
                    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                        <div>
                            <div className="mb-3 flex items-center gap-2.5">
                                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 text-[11px] font-semibold tracking-wide text-emerald-600 dark:text-emerald-400">
                                    <Sparkles
                                        className="h-3.5 w-3.5"
                                        strokeWidth={2}
                                    />
                                    PLATFORM OVERVIEW
                                </span>
                            </div>

                            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white sm:text-4xl">
                                Admin Dashboard
                            </h1>

                            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                                A real-time overview of your Media Masters
                                platform, activity, and operations.
                            </p>
                        </div>

                        <button
                            onClick={fetchDashboardData}
                            className="group inline-flex h-10 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:text-slate-900 hover:shadow-md active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-white sm:self-auto"
                        >
                            <Activity className="h-4 w-4 text-emerald-500 transition-transform group-hover:rotate-90" />
                            Refresh
                        </button>
                    </div>
                </motion.div>

                {/* Stats */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {statCards.map((stat, index) => {
                        const Icon = stat.icon;

                        return (
                            <motion.div
                                key={stat.label}
                                initial={{
                                    opacity: 0,
                                    y: 12,
                                }}
                                animate={{
                                    opacity: 1,
                                    y: 0,
                                }}
                                transition={{
                                    delay: index * 0.035,
                                    duration: 0.35,
                                }}
                                className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_35px_rgba(15,23,42,0.07)] dark:border-slate-800/80 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:shadow-[0_12px_35px_rgba(0,0,0,0.2)]"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                                            {stat.label}
                                        </p>

                                        <p className="mt-3 truncate text-[27px] font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">
                                            {stat.value}
                                        </p>
                                    </div>

                                    <div
                                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${stat.color} transition-transform duration-300 group-hover:scale-105`}
                                    >
                                        <Icon
                                            className={`h-[19px] w-[19px] ${stat.iconColor}`}
                                            strokeWidth={1.8}
                                        />
                                    </div>
                                </div>

                                <div className="mt-5 flex items-center justify-between">
                                    <span className="text-xs text-slate-400 dark:text-slate-500">
                                        Platform metric
                                    </span>

                                    <ArrowUpRight
                                        className="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-emerald-500 dark:text-slate-700"
                                        strokeWidth={1.8}
                                    />
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Activity */}
                <motion.div
                    initial={{
                        opacity: 0,
                        y: 15,
                    }}
                    animate={{
                        opacity: 1,
                        y: 0,
                    }}
                    transition={{
                        delay: 0.25,
                        duration: 0.4,
                    }}
                    className="mt-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-slate-800/80 dark:bg-slate-900"
                >
                    {/* Activity Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                                <Clock
                                    className="h-[17px] w-[17px] text-emerald-500"
                                    strokeWidth={1.8}
                                />
                            </div>

                            <div>
                                <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                                    Recent Activity
                                </h2>

                                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                    Latest platform events
                                </p>
                            </div>
                        </div>

                        <div className="hidden items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800 sm:flex">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Live
                            </span>
                        </div>
                    </div>

                    {/* Activity List */}
                    {recentActivity.length === 0 ? (
                        <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800">
                                <Clock className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                            </div>

                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                No activity yet
                            </h3>

                            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400 dark:text-slate-500">
                                Platform activity will appear here as
                                administrators and users interact with the
                                system.
                            </p>
                        </div>
                    ) : (
                        <div className="max-h-[430px] overflow-y-auto">
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {recentActivity.map((activity, index) => {
                                    const actionIcon =
                                        getActionIcon(activity.action);

                                    const Icon = actionIcon.Icon;

                                    return (
                                        <motion.div
                                            key={activity._id}
                                            initial={{
                                                opacity: 0,
                                                x: -8,
                                            }}
                                            animate={{
                                                opacity: 1,
                                                x: 0,
                                            }}
                                            transition={{
                                                delay:
                                                    0.3 +
                                                    index * 0.025,
                                            }}
                                            className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 sm:px-6"
                                        >
                                            <div
                                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${actionIcon.background}`}
                                            >
                                                <Icon
                                                    className={`h-[17px] w-[17px] ${actionIcon.className}`}
                                                    strokeWidth={1.8}
                                                />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                                    <p className="truncate text-sm font-medium capitalize text-slate-700 dark:text-slate-200">
                                                        {activity.action
                                                            ?.replace(
                                                                /_/g,
                                                                " "
                                                            )
                                                            .toLowerCase() ||
                                                            "Activity"}
                                                    </p>

                                                    <span className="hidden text-slate-300 dark:text-slate-700 sm:block">
                                                        •
                                                    </span>

                                                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                                                        {activity.userId
                                                            ?.name ||
                                                            "System"}
                                                    </p>
                                                </div>

                                                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                                                    {formatDate(
                                                        activity.createdAt
                                                    )}
                                                </p>
                                            </div>

                                            <ArrowUpRight
                                                className="hidden h-4 w-4 text-slate-300 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-emerald-500 group-hover:opacity-100 dark:text-slate-700 sm:block"
                                                strokeWidth={1.8}
                                            />
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}