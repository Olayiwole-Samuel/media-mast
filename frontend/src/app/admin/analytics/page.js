"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    Clock,
    BarChart3,
    Users,
    Building2,
    Radio,
    Megaphone,
    CalendarDays,
    CreditCard,
    Loader2,
    Sparkles,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function AdminAnalyticsPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

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
            fetchAnalytics();
        } catch {
            router.push("/login");
        }
    }, [router]);

    async function fetchAnalytics() {
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_URL}/api/v1/admin/dashboard`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to load analytics");
            }

            setData(result.data);
        } catch (error) {
            console.error("Error fetching analytics:", error);
            setError(error.message);
        } finally {
            setIsLoading(false);
        }
    }

    if (isLoading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-9 w-9 animate-spin text-emerald-500" />
                    <p className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
                        Loading analytics…
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="text-center">
                    <p className="text-red-500">{error}</p>
                    <button
                        onClick={fetchAnalytics}
                        className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                    >
                        Retry
                    </button>
                </div>
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

    const formatCurrency = (amount) => {
        const value = Number(amount) || 0;
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    const analyticsCards = [
        {
            label: "Total Users",
            value: stats.totalUsers,
            icon: Users,
            color: "text-blue-500",
            bg: "bg-blue-50 dark:bg-blue-500/10",
        },
        {
            label: "Companies",
            value: stats.totalCompanies,
            icon: Building2,
            color: "text-purple-500",
            bg: "bg-purple-50 dark:bg-purple-500/10",
        },
        {
            label: "Stations",
            value: stats.totalStations,
            icon: Radio,
            color: "text-emerald-500",
            bg: "bg-emerald-50 dark:bg-emerald-500/10",
        },
        {
            label: "Campaigns",
            value: stats.totalCampaigns,
            icon: Megaphone,
            color: "text-orange-500",
            bg: "bg-orange-50 dark:bg-orange-500/10",
        },
        {
            label: "Bookings",
            value: stats.totalBookings,
            icon: CalendarDays,
            color: "text-pink-500",
            bg: "bg-pink-50 dark:bg-pink-500/10",
        },
        {
            label: "Revenue",
            value: formatCurrency(stats.totalRevenue),
            icon: CreditCard,
            color: "text-emerald-500",
            bg: "bg-emerald-50 dark:bg-emerald-500/10",
            hint: "Payments are not live yet",
        },
    ];

    return (
        <div>
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
            >
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <BarChart3 className="h-6 w-6 text-emerald-500" />
                        Platform Analytics
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Overview of platform performance and growth
                    </p>
                </div>
            </motion.div>

            {/* Analytics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {analyticsCards.map((card, index) => {
                    const Icon = card.icon;
                    return (
                        <motion.div
                            key={card.label}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        {card.label}
                                    </p>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                                        {card.value}
                                    </p>
                                </div>
                                <div className={`p-2.5 rounded-lg ${card.bg}`}>
                                    <Icon className={`h-5 w-5 ${card.color}`} />
                                </div>
                            </div>
                            {card.hint && <p className="mt-2 text-xs text-slate-400">{card.hint}</p>}
                        </motion.div>
                    );
                })}
            </div>

            {/* Pending Approvals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Clock className="h-4 w-4 text-yellow-500" />
                        Pending Approvals
                    </h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-500/10 rounded-lg">
                            <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-yellow-600" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Companies</span>
                            </div>
                            <span className="text-lg font-bold text-yellow-600">{stats.pendingCompanies}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-500/10 rounded-lg">
                            <div className="flex items-center gap-2">
                                <Radio className="h-4 w-4 text-yellow-600" />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Stations</span>
                            </div>
                            <span className="text-lg font-bold text-yellow-600">{stats.pendingStations}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Sparkles className="h-4 w-4 text-emerald-500" />
                        Platform Summary
                    </h3>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm py-1.5 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 dark:text-slate-400">Total Users</span>
                            <span className="font-medium text-slate-900 dark:text-white">{stats.totalUsers}</span>
                        </div>
                        <div className="flex justify-between text-sm py-1.5 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 dark:text-slate-400">Total Companies</span>
                            <span className="font-medium text-slate-900 dark:text-white">{stats.totalCompanies}</span>
                        </div>
                        <div className="flex justify-between text-sm py-1.5 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 dark:text-slate-400">Total Stations</span>
                            <span className="font-medium text-slate-900 dark:text-white">{stats.totalStations}</span>
                        </div>
                        <div className="flex justify-between text-sm py-1.5 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 dark:text-slate-400">Total Campaigns</span>
                            <span className="font-medium text-slate-900 dark:text-white">{stats.totalCampaigns}</span>
                        </div>
                        <div className="flex justify-between text-sm py-1.5 border-b border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500 dark:text-slate-400">Total Bookings</span>
                            <span className="font-medium text-slate-900 dark:text-white">{stats.totalBookings}</span>
                        </div>
                        <div className="flex justify-between text-sm py-1.5">
                            <span className="text-slate-500 dark:text-slate-400">Total Revenue</span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(stats.totalRevenue)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <p className="text-xs text-slate-400">Growth trends will appear here once historical figures are available. We don&apos;t show estimated percentages.</p>
        </div>
    );
}