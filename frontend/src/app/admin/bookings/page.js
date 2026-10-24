"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
    CalendarDays,
    Search,
    Eye,
    Loader2,
    Calendar,
    Building2,
    User,
    Clock,
    CheckCircle,
    XCircle,
    Radio,
    Megaphone,
    X,
    Timer,
    CircleDollarSign,
    Hash,
    FileCheck2,
    RefreshCw,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function AdminBookingsPage() {
    const router = useRouter();

    const [isLoading, setIsLoading] = useState(true);
    const [bookings, setBookings] = useState([]);
    const [filteredBookings, setFilteredBookings] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [error, setError] = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);
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

            fetchBookings();
        } catch (error) {
            console.error("Invalid user data:", error);
            router.push("/login");
        }
    }, [router]);

    async function fetchBookings() {
        try {
            setIsLoading(true);
            setError(null);

            const token = localStorage.getItem("token");

            if (!token) {
                router.push("/login");
                return;
            }

            const response = await fetch(
                `${API_URL}/api/v1/admin/bookings`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            let result = null;

            const contentType =
                response.headers.get("content-type") || "";

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
                    result?.message || "Failed to load bookings"
                );
            }

            const bookingData = Array.isArray(result?.data)
                ? result.data
                : [];

            setBookings(bookingData);
            setFilteredBookings(bookingData);
        } catch (error) {
            console.error(
                "Error fetching admin bookings:",
                error
            );

            setError(
                error?.message || "Failed to load bookings"
            );
        } finally {
            setIsLoading(false);
        }
    }

    const handleSearch = (query) => {
        setSearchQuery(query);
        filterBookings(query, filterStatus);
    };

    const handleFilter = (status) => {
        setFilterStatus(status);
        filterBookings(searchQuery, status);
    };

    const filterBookings = (query, status) => {
        let filtered = [...bookings];

        const normalizedQuery = query.trim().toLowerCase();

        if (normalizedQuery) {
            filtered = filtered.filter((booking) => {
                const slot =
                    booking.slot?.toLowerCase() || "";

                const stationName =
                    booking.stationId?.name?.toLowerCase() || "";

                const campaignName =
                    booking.campaignId?.name?.toLowerCase() || "";

                const companyName =
                    booking.companyId?.name?.toLowerCase() || "";

                const userName =
                    booking.userId?.name?.toLowerCase() || "";

                const bookingReference =
                    booking.bookingReference?.toLowerCase() || "";

                return (
                    slot.includes(normalizedQuery) ||
                    stationName.includes(normalizedQuery) ||
                    campaignName.includes(normalizedQuery) ||
                    companyName.includes(normalizedQuery) ||
                    userName.includes(normalizedQuery) ||
                    bookingReference.includes(normalizedQuery)
                );
            });
        }

        if (status !== "all") {
            filtered = filtered.filter(
                (booking) => booking.status === status
            );
        }

        setFilteredBookings(filtered);
    };

    const getStatusColor = (status) => {
        const colors = {
            PENDING:
                "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",

            ACCEPTED:
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",

            REJECTED:
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",

            CHANGES_REQUESTED:
                "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",

            SCHEDULED:
                "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",

            COMPLETED:
                "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",

            CANCELLED:
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
        };

        return (
            colors[status] ||
            "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400"
        );
    };

    const getStatusIcon = (status) => {
        const icons = {
            PENDING: <Clock className="h-3.5 w-3.5" />,

            ACCEPTED: (
                <CheckCircle className="h-3.5 w-3.5" />
            ),

            REJECTED: (
                <XCircle className="h-3.5 w-3.5" />
            ),

            CHANGES_REQUESTED: (
                <Clock className="h-3.5 w-3.5" />
            ),

            SCHEDULED: (
                <Clock className="h-3.5 w-3.5" />
            ),

            COMPLETED: (
                <CheckCircle className="h-3.5 w-3.5" />
            ),

            CANCELLED: (
                <XCircle className="h-3.5 w-3.5" />
            ),
        };

        return (
            icons[status] || (
                <Clock className="h-3.5 w-3.5" />
            )
        );
    };

    const getInitials = (value) => {
        if (!value) return "BK";

        const words = value
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (words.length === 1) {
            return words[0].slice(0, 2).toUpperCase();
        }

        return `${words[0][0]}${words[1][0]}`.toUpperCase();
    };

    const formatStatus = (status) => {
        if (!status) return "Unknown";

        return status
            .toLowerCase()
            .replace(/_/g, " ")
            .replace(/\b\w/g, (letter) =>
                letter.toUpperCase()
            );
    };

    const formatCurrency = (amount, currency = "NGN") => {
        const value = Number(amount) || 0;

        return new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: currency || "NGN",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
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
        });
    };

    const formatTime = (time) => {
        if (!time) return "N/A";

        return time;
    };

    const statusOptions = [
        {
            value: "all",
            label: "All",
        },
        {
            value: "PENDING",
            label: "Pending",
        },
        {
            value: "ACCEPTED",
            label: "Accepted",
        },
        {
            value: "REJECTED",
            label: "Rejected",
        },
        {
            value: "CHANGES_REQUESTED",
            label: "Changes Requested",
        },
        {
            value: "SCHEDULED",
            label: "Scheduled",
        },
        {
            value: "COMPLETED",
            label: "Completed",
        },
        {
            value: "CANCELLED",
            label: "Cancelled",
        },
    ];

    const stats = {
        total: bookings.length,

        pending: bookings.filter(
            (booking) => booking.status === "PENDING"
        ).length,

        accepted: bookings.filter(
            (booking) =>
                booking.status === "ACCEPTED" ||
                booking.status === "SCHEDULED"
        ).length,

        completed: bookings.filter(
            (booking) => booking.status === "COMPLETED"
        ).length,

        cancelled: bookings.filter(
            (booking) =>
                booking.status === "CANCELLED" ||
                booking.status === "REJECTED"
        ).length,
    };

    const statCards = [
        {
            label: "Total bookings",
            value: stats.total,
            icon: CalendarDays,
            iconClass:
                "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        },
        {
            label: "Pending",
            value: stats.pending,
            icon: Clock,
            iconClass:
                "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-400",
        },
        {
            label: "Accepted",
            value: stats.accepted,
            icon: CheckCircle,
            iconClass:
                "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
        },
        {
            label: "Completed",
            value: stats.completed,
            icon: CheckCircle,
            iconClass:
                "bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
        },
    ];

    const closeDetails = () => {
        setShowDetails(false);
        setSelectedBooking(null);
    };

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
                        Loading bookings…
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
                        Failed to load bookings
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {error}
                    </p>

                    <button
                        onClick={fetchBookings}
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
                        <CalendarDays className="h-4 w-4" />
                        Booking management
                    </div>

                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                        Bookings
                    </h1>

                    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Monitor and review every media booking across
                        the platform.
                    </p>
                </div>

                <button
                    onClick={fetchBookings}
                    className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                    title="Refresh bookings"
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
                className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
                {statCards.map((stat) => {
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
                            className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                        >
                            <div className="flex items-start justify-between gap-3">
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
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* Search / Filters */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <input
                            type="text"
                            placeholder="Search by station, slot, campaign, company, user or reference..."
                            value={searchQuery}
                            onChange={(event) =>
                                handleSearch(event.target.value)
                            }
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-950"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        {statusOptions.map((option) => {
                            const isActive =
                                filterStatus === option.value;

                            return (
                                <button
                                    key={option.value}
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
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </motion.div>

            {/* Results Meta */}
            <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                    Showing{" "}
                    <span className="text-slate-600 dark:text-slate-300">
                        {filteredBookings.length}
                    </span>{" "}
                    of{" "}
                    <span className="text-slate-600 dark:text-slate-300">
                        {bookings.length}
                    </span>{" "}
                    bookings
                </p>

                {searchQuery && (
                    <button
                        onClick={() => handleSearch("")}
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                        Clear search
                    </button>
                )}
            </div>

            {/* Table */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/60">
                                <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    Booking
                                </th>

                                <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    Station
                                </th>

                                <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    Status
                                </th>

                                <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    Price
                                </th>

                                <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    Schedule
                                </th>

                                <th className="px-5 py-3.5 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                    Action
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredBookings.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="6"
                                        className="px-5 py-16"
                                    >
                                        <div className="flex flex-col items-center justify-center text-center">
                                            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
                                                <CalendarDays className="h-5 w-5 text-slate-400" />
                                            </div>

                                            <p className="font-medium text-slate-700 dark:text-slate-300">
                                                No bookings found
                                            </p>

                                            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
                                                Try adjusting your search
                                                or changing the selected
                                                status filter.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredBookings.map(
                                    (booking, index) => {
                                        const campaignName =
                                            booking.campaignId
                                                ?.name ||
                                            "No campaign";

                                        const slot =
                                            booking.slot ||
                                            "Untitled booking";

                                        return (
                                            <motion.tr
                                                key={
                                                    booking._id
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
                                                className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                                            >
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xs font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                                                            {getInitials(
                                                                slot
                                                            )}
                                                        </div>

                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                                                {slot}
                                                            </p>

                                                            <div className="mt-0.5 flex items-center gap-1.5">
                                                                <Hash className="h-3 w-3 text-slate-400" />

                                                                <p className="truncate text-[11px] text-slate-400">
                                                                    {booking.bookingReference ||
                                                                        campaignName}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                                                            <Radio className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                                                        </div>

                                                        <div>
                                                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                                {booking
                                                                    .stationId
                                                                    ?.name ||
                                                                    "Unknown"}
                                                            </p>

                                                            <p className="mt-0.5 text-[11px] text-slate-400">
                                                                Station
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-5 py-4">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${getStatusColor(
                                                            booking.status
                                                        )}`}
                                                    >
                                                        {getStatusIcon(
                                                            booking.status
                                                        )}

                                                        {formatStatus(
                                                            booking.status
                                                        )}
                                                    </span>
                                                </td>

                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <CircleDollarSign className="h-4 w-4 text-slate-400" />

                                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                            {formatCurrency(
                                                                booking.price,
                                                                booking.currency
                                                            )}
                                                        </span>
                                                    </div>
                                                </td>

                                                <td className="px-5 py-4">
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar className="h-3.5 w-3.5 text-slate-400" />

                                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                                {formatDate(
                                                                    booking.date
                                                                )}
                                                            </span>
                                                        </div>

                                                        <div className="mt-1 flex items-center gap-1.5">
                                                            <Clock className="h-3 w-3 text-slate-400" />

                                                            <span className="text-[11px] text-slate-400">
                                                                {formatTime(
                                                                    booking.time
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-5 py-4 text-right">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedBooking(
                                                                booking
                                                            );
                                                            setShowDetails(
                                                                true
                                                            );
                                                        }}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-400 transition-all hover:border-slate-200 hover:bg-white hover:text-slate-700 hover:shadow-sm dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                                        title="View booking details"
                                                    >
                                                        <Eye className="h-4 w-4" />
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
                {showDetails && selectedBooking && (
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
                                closeDetails();
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
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                                            {getInitials(
                                                selectedBooking.slot
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-500">
                                                Booking details
                                            </p>

                                            <h3 className="mt-1 truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                                                {selectedBooking.slot ||
                                                    "Untitled booking"}
                                            </h3>

                                            {selectedBooking.bookingReference && (
                                                <p className="mt-0.5 truncate text-xs text-slate-400">
                                                    {
                                                        selectedBooking.bookingReference
                                                    }
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={closeDetails}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                        title="Close"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>

                                <div className="mt-4">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${getStatusColor(
                                            selectedBooking.status
                                        )}`}
                                    >
                                        {getStatusIcon(
                                            selectedBooking.status
                                        )}

                                        {formatStatus(
                                            selectedBooking.status
                                        )}
                                    </span>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="max-h-[calc(90vh-145px)] overflow-y-auto px-5 py-5 sm:px-6">
                                <div className="space-y-5">
                                    {/* Primary Details */}
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <DetailCard
                                            icon={Megaphone}
                                            label="Campaign"
                                            value={
                                                selectedBooking
                                                    .campaignId
                                                    ?.name ||
                                                "Unknown"
                                            }
                                        />

                                        <DetailCard
                                            icon={Radio}
                                            label="Station"
                                            value={
                                                selectedBooking
                                                    .stationId
                                                    ?.name ||
                                                "Unknown"
                                            }
                                        />

                                        <DetailCard
                                            icon={Calendar}
                                            label="Date"
                                            value={formatDate(
                                                selectedBooking.date
                                            )}
                                        />

                                        <DetailCard
                                            icon={Clock}
                                            label="Time"
                                            value={formatTime(
                                                selectedBooking.time
                                            )}
                                        />
                                    </div>

                                    {/* Booking Metrics */}
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                                            <div className="mb-2 flex items-center gap-2 text-slate-400">
                                                <Timer className="h-4 w-4" />

                                                <span className="text-[10px] font-bold uppercase tracking-[0.12em]">
                                                    Duration
                                                </span>
                                            </div>

                                            <p className="text-base font-semibold text-slate-900 dark:text-white">
                                                {selectedBooking.duration ||
                                                    0}{" "}
                                                minutes
                                            </p>
                                        </div>

                                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                                            <div className="mb-2 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                                <CircleDollarSign className="h-4 w-4" />

                                                <span className="text-[10px] font-bold uppercase tracking-[0.12em]">
                                                    Price
                                                </span>
                                            </div>

                                            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                                                {formatCurrency(
                                                    selectedBooking.price,
                                                    selectedBooking.currency
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {/* People */}
                                    <div>
                                        <SectionLabel label="Booking parties" />

                                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <DetailCard
                                                icon={Building2}
                                                label="Company"
                                                value={
                                                    selectedBooking
                                                        .companyId
                                                        ?.name ||
                                                    "Unknown"
                                                }
                                            />

                                            <DetailCard
                                                icon={User}
                                                label="Booked by"
                                                value={
                                                    selectedBooking
                                                        .userId?.name ||
                                                    selectedBooking
                                                        .userId?.email ||
                                                    "Unknown"
                                                }
                                            />
                                        </div>
                                    </div>

                                    {/* Station Response */}
                                    {selectedBooking.stationResponse && (
                                        <div>
                                            <SectionLabel label="Station response" />

                                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                                                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                    {
                                                        selectedBooking.stationResponse
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Station Note */}
                                    {selectedBooking.stationNote && (
                                        <div>
                                            <SectionLabel label="Station note" />

                                            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                                                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                    {
                                                        selectedBooking.stationNote
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Proof */}
                                    {selectedBooking.proofUrl && (
                                        <div>
                                            <SectionLabel label="Proof of delivery" />

                                            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                                                        <FileCheck2 className="h-4 w-4" />
                                                    </div>

                                                    <div>
                                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                            Proof uploaded
                                                        </p>

                                                        {selectedBooking.proofUploadedAt && (
                                                            <p className="mt-0.5 text-xs text-slate-400">
                                                                Uploaded{" "}
                                                                {formatDate(
                                                                    selectedBooking.proofUploadedAt
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <a
                                                    href={
                                                        selectedBooking.proofUrl
                                                    }
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                    View proof
                                                </a>
                                            </div>
                                        </div>
                                    )}

                                    {/* Status Message */}
                                    {selectedBooking.status ===
                                        "COMPLETED" && (
                                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                                            <div className="flex items-start gap-3">
                                                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />

                                                <div>
                                                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                                                        Booking completed
                                                    </p>

                                                    <p className="mt-1 text-xs leading-5 text-emerald-600/80 dark:text-emerald-400/80">
                                                        This booking has been
                                                        completed successfully.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {selectedBooking.status ===
                                        "PENDING" && (
                                        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-500/20 dark:bg-yellow-500/10">
                                            <div className="flex items-start gap-3">
                                                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />

                                                <div>
                                                    <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                                                        Awaiting station response
                                                    </p>

                                                    <p className="mt-1 text-xs leading-5 text-yellow-600/80 dark:text-yellow-400/80">
                                                        This booking is currently
                                                        pending a response from
                                                        the station.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
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