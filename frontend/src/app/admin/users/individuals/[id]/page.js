"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    User,
    Mail,
    Clock,
    ShieldCheck,
    Activity,
    Megaphone,
    CalendarDays,
    CreditCard,
    Pencil,
    UserX,
    UserCheck,
    RotateCcw,
    Trash2,
    Loader2,
    CheckCircle,
    XCircle,
    Plus,
    Eye,
    MoreHorizontal,
    AlertTriangle,
} from "lucide-react";

import {
    getAdminIndividual,
    getAdminIndividualCampaigns,
    getAdminIndividualBookings,
    getAdminIndividualActivity,
    suspendAdminIndividual,
    activateAdminIndividual,
    reactivateAdminIndividual,
    resetAdminIndividual,
    deleteAdminIndividual,
} from "@/lib/api";

export default function IndividualProfilePage() {
    const router = useRouter();
    const params = useParams();

    const individualId = params?.id;

    const [individual, setIndividual] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [activities, setActivities] = useState([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const [actionLoading, setActionLoading] = useState(null);
    const [actionError, setActionError] = useState(null);

    const [showActions, setShowActions] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const [resetResult, setResetResult] = useState(null);

    // ─────────────────────────────────────────────
    // LOAD PROFILE DATA
    // ─────────────────────────────────────────────

    const loadData = async (refresh = false) => {
        if (!individualId) return;

        try {
            if (refresh) {
                setIsRefreshing(true);
            } else {
                setIsLoading(true);
            }

            setError(null);

            const [
                individualResponse,
                campaignsResponse,
                bookingsResponse,
                activityResponse,
            ] = await Promise.all([
                getAdminIndividual(individualId),
                getAdminIndividualCampaigns(individualId),
                getAdminIndividualBookings(individualId),
                getAdminIndividualActivity(individualId),
            ]);

            setIndividual(individualResponse?.data || null);

            setCampaigns(
                campaignsResponse?.data?.campaigns || []
            );

            setBookings(
                bookingsResponse?.data?.bookings || []
            );

            setActivities(
                activityResponse?.data?.activities || []
            );
        } catch (error) {
            console.error(
                "❌ Error loading individual profile:",
                error
            );

            setError(
                error.message ||
                "Failed to load individual profile"
            );
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, [individualId]);

    // ─────────────────────────────────────────────
    // FORMATTING
    // ─────────────────────────────────────────────

    const formatDate = (date) => {
        if (!date) return "Never";

        const parsed = new Date(date);

        if (Number.isNaN(parsed.getTime())) {
            return "—";
        }

        return parsed.toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    const formatDateTime = (date) => {
        if (!date) return "Never";

        const parsed = new Date(date);

        if (Number.isNaN(parsed.getTime())) {
            return "—";
        }

        return parsed.toLocaleString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    };

    const formatCurrency = (amount, currency = "NGN") => {
        if (amount === undefined || amount === null) {
            return "—";
        }

        try {
            return new Intl.NumberFormat("en-NG", {
                style: "currency",
                currency,
                maximumFractionDigits: 0,
            }).format(amount);
        } catch {
            return `${currency} ${Number(amount).toLocaleString()}`;
        }
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

    const getCampaignStatusColor = (status) => {
        const colors = {
            DRAFT:
                "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",

            SUBMITTED:
                "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",

            ACCEPTED:
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",

            LIVE:
                "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400",

            COMPLETED:
                "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",

            REJECTED:
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",

            CANCELLED:
                "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",

            PAYMENT_PENDING:
                "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",

            SCHEDULED:
                "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400",
        };

        return (
            colors[status] ||
            "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400"
        );
    };

    const getBookingStatusColor = (status) => {
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
                "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
        };

        return (
            colors[status] ||
            "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400"
        );
    };

    // ─────────────────────────────────────────────
    // ACCOUNT ACTIONS
    // ─────────────────────────────────────────────

    const handleAccountAction = async (
        action,
        actionFunction
    ) => {
        try {
            setActionLoading(action);
            setActionError(null);

            await actionFunction(individualId);

            await loadData(true);
        } catch (error) {
            console.error(
                `❌ ${action} individual error:`,
                error
            );

            setActionError(
                error.message ||
                `Failed to ${action.toLowerCase()} individual`
            );
        } finally {
            setActionLoading(null);
        }
    };

    const handleReset = async () => {
        try {
            setActionLoading("reset");
            setActionError(null);
            setResetResult(null);

            const response =
                await resetAdminIndividual(individualId);

            setResetResult(response?.data || null);
            setShowResetConfirm(false);

            await loadData(true);
        } catch (error) {
            console.error(
                "❌ Reset individual error:",
                error
            );

            setActionError(
                error.message ||
                "Failed to reset individual account"
            );
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async () => {
        try {
            setActionLoading("delete");
            setActionError(null);

            await deleteAdminIndividual(individualId);

            router.push("/admin/users/individuals");
        } catch (error) {
            console.error(
                "❌ Delete individual error:",
                error
            );

            setActionError(
                error.message ||
                "Failed to delete individual"
            );

            setActionLoading(null);
        }
    };

    // ─────────────────────────────────────────────
    // LOADING
    // ─────────────────────────────────────────────

    if (isLoading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-9 w-9 animate-spin text-emerald-500" />

                    <p className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
                        Loading individual…
                    </p>
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────
    // ERROR
    // ─────────────────────────────────────────────

    if (error || !individual) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="text-center">
                    <XCircle className="mx-auto h-10 w-10 text-red-500" />

                    <p className="mt-3 text-sm text-red-500">
                        {error || "Individual not found"}
                    </p>

                    <button
                        onClick={() =>
                            router.push(
                                "/admin/users/individuals"
                            )
                        }
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Individuals
                    </button>
                </div>
            </div>
        );
    }

    const initials =
        individual.name
            ?.split(" ")
            .map((part) => part.charAt(0))
            .join("")
            .slice(0, 2)
            .toUpperCase() || "U";

    return (
        <div>
            {/* Back */}
            <button
                onClick={() =>
                    router.push(
                        "/admin/users/individuals"
                    )
                }
                className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-emerald-500 dark:text-slate-400"
            >
                <ArrowLeft className="h-4 w-4" />
                Individuals
            </button>

            {/* Action Error */}
            {actionError && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />

                    <div>
                        <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                            Action failed
                        </p>

                        <p className="mt-1 text-xs text-red-600 dark:text-red-400/80">
                            {actionError}
                        </p>
                    </div>

                    <button
                        onClick={() => setActionError(null)}
                        className="ml-auto text-xs font-medium text-red-500 hover:text-red-700"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Reset Result */}
            {resetResult?.temporaryPassword && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <div className="flex items-start gap-3">
                        <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />

                        <div className="min-w-0">
                            <p className="font-semibold text-amber-800 dark:text-amber-300">
                                Account reset successfully
                            </p>

                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                                A new temporary password was generated.
                                Give it to the individual securely.
                            </p>

                            <div className="mt-3 rounded-lg border border-amber-200 bg-white px-4 py-3 font-mono text-sm font-bold tracking-wide text-slate-800 dark:border-amber-500/20 dark:bg-slate-900 dark:text-white">
                                {resetResult.temporaryPassword}
                            </div>

                            <button
                                onClick={() =>
                                    setResetResult(null)
                                }
                                className="mt-3 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                            >
                                Hide temporary password
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-20 mb-6 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"            >
                <div className="h-24 bg-gradient-to-r from-emerald-500/15 via-emerald-400/10 to-blue-500/10" />

                <div className="px-6 pb-6">
                    <div className="-mt-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex items-end gap-4">
                            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-blue-100 text-xl font-bold text-blue-700 shadow-sm dark:border-slate-900 dark:bg-blue-500/20 dark:text-blue-400">
                                {individual.image ? (
                                    <img
                                        src={individual.image}
                                        alt={individual.name}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    initials
                                )}
                            </div>

                            <div className="pb-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                                        {individual.name}
                                    </h1>

                                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-400">
                                        INDIVIDUAL
                                    </span>
                                </div>

                                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                    <Mail className="h-3.5 w-3.5" />
                                    {individual.email}
                                </p>
                            </div>
                        </div>

                        <div className="relative flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${getStatusColor(
                                    individual.status
                                )}`}
                            >
                                {individual.status === "ACTIVE" ? (
                                    <CheckCircle className="h-3.5 w-3.5" />
                                ) : (
                                    <XCircle className="h-3.5 w-3.5" />
                                )}

                                {individual.status}
                            </span>

                            <button
                                onClick={() =>
                                    router.push(
                                        `/admin/users/individuals/${individual._id}/edit`
                                    )
                                }
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                            >
                                <Pencil className="h-4 w-4" />
                                Edit
                            </button>

                            <button
                                onClick={() =>
                                    setShowActions(
                                        !showActions
                                    )
                                }
                                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                            >
                                <MoreHorizontal className="h-4 w-4" />
                                Actions
                            </button>

                            {showActions && (
                                <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                    {individual.status ===
                                        "ACTIVE" && (
                                            <button
                                                disabled={
                                                    actionLoading !==
                                                    null
                                                }
                                                onClick={() =>
                                                    handleAccountAction(
                                                        "Suspend",
                                                        suspendAdminIndividual
                                                    )
                                                }
                                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
                                            >
                                                {actionLoading ===
                                                    "Suspend" ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <UserX className="h-4 w-4" />
                                                )}
                                                Suspend Account
                                            </button>
                                        )}

                                    {individual.status ===
                                        "PENDING" && (
                                            <button
                                                disabled={
                                                    actionLoading !==
                                                    null
                                                }
                                                onClick={() =>
                                                    handleAccountAction(
                                                        "Activate",
                                                        activateAdminIndividual
                                                    )
                                                }
                                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                                            >
                                                {actionLoading ===
                                                    "Activate" ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <UserCheck className="h-4 w-4" />
                                                )}
                                                Activate Account
                                            </button>
                                        )}

                                    {(individual.status ===
                                        "SUSPENDED" ||
                                        individual.status ===
                                        "DEACTIVATED") && (
                                            <button
                                                disabled={
                                                    actionLoading !==
                                                    null
                                                }
                                                onClick={() =>
                                                    handleAccountAction(
                                                        "Reactivate",
                                                        reactivateAdminIndividual
                                                    )
                                                }
                                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                                            >
                                                {actionLoading ===
                                                    "Reactivate" ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <UserCheck className="h-4 w-4" />
                                                )}
                                                Reactivate Account
                                            </button>
                                        )}

                                    <button
                                        disabled={
                                            actionLoading !== null
                                        }
                                        onClick={() => {
                                            setShowActions(false);
                                            setShowResetConfirm(
                                                true
                                            );
                                        }}
                                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                        Reset Account
                                    </button>

                                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                                    <button
                                        disabled={
                                            actionLoading !== null
                                        }
                                        onClick={() => {
                                            setShowActions(false);
                                            setShowDeleteConfirm(
                                                true
                                            );
                                        }}
                                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Delete Individual
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Overview Stats */}
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/10">
                        <Megaphone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>

                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Campaigns
                    </p>

                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                        {campaigns.length}
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/10">
                        <CalendarDays className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>

                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Bookings
                    </p>

                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                        {bookings.length}
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/10">
                        <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>

                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Login Count
                    </p>

                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                        {individual.loginCount || 0}
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-500/10">
                        <ShieldCheck className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>

                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Account Type
                    </p>

                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                        INDIVIDUAL
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    {/* Account Information */}
                    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                                Account Information
                            </h2>

                            <p className="mt-1 text-xs text-slate-400">
                                Basic information about this individual
                            </p>
                        </div>

                        <div className="grid gap-6 p-6 sm:grid-cols-2">
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                                    Full Name
                                </p>

                                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <User className="h-4 w-4 text-slate-400" />
                                    {individual.name ||
                                        "Not provided"}
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                                    Email Address
                                </p>

                                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <Mail className="h-4 w-4 text-slate-400" />
                                    {individual.email}
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                                    Account Type
                                </p>

                                <div className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                                    INDIVIDUAL
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                                    Status
                                </p>

                                <div className="mt-2">
                                    <span
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(
                                            individual.status
                                        )}`}
                                    >
                                        {individual.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Campaigns */}
                    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
                            <div>
                                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                                    Campaigns
                                </h2>

                                <p className="mt-1 text-xs text-slate-400">
                                    Campaigns belonging to this individual
                                </p>
                            </div>

                            <button
                                onClick={() =>
                                    router.push(
                                        `/admin/users/individuals/${individual._id}/campaigns/create`
                                    )
                                }
                                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600"
                            >
                                <Plus className="h-4 w-4" />
                                Create Campaign
                            </button>
                        </div>

                        {campaigns.length === 0 ? (
                            <div className="p-8 text-center">
                                <Megaphone className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />

                                <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                                    No campaigns yet
                                </p>

                                <p className="mt-1 text-xs text-slate-400">
                                    Create a campaign on behalf of this
                                    individual.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {campaigns.slice(0, 5).map(
                                    (campaign) => (
                                        <div
                                            key={campaign._id}
                                            className="flex items-center justify-between gap-4 p-5 transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                        {
                                                            campaign.name
                                                        }
                                                    </h3>

                                                    <span
                                                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${getCampaignStatusColor(
                                                            campaign.status
                                                        )}`}
                                                    >
                                                        {
                                                            campaign.status
                                                        }
                                                    </span>
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                                                    <span>
                                                        {
                                                            campaign.currency
                                                        }{" "}
                                                        {Number(
                                                            campaign.budget ||
                                                            0
                                                        ).toLocaleString()}
                                                    </span>

                                                    <span>
                                                        Created{" "}
                                                        {formatDate(
                                                            campaign.createdAt
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() =>
                                                    router.push(
                                                        `/admin/users/individuals/${individual._id}/campaigns/${campaign._id}`
                                                    )
                                                }
                                                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500/30 dark:hover:text-emerald-400"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                View
                                            </button>
                                        </div>
                                    )
                                )}
                            </div>
                        )}

                        {campaigns.length > 5 && (
                            <div className="border-t border-slate-100 p-4 text-center dark:border-slate-800">
                                <button
                                    onClick={() =>
                                        router.push(
                                            `/admin/users/individuals/${individual._id}/campaigns`
                                        )
                                    }
                                    className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                                >
                                    View all {campaigns.length} campaigns
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Bookings */}
                    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                                Bookings
                            </h2>

                            <p className="mt-1 text-xs text-slate-400">
                                Bookings associated with this individual
                            </p>
                        </div>

                        {bookings.length === 0 ? (
                            <div className="p-8 text-center">
                                <CalendarDays className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />

                                <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                                    No bookings yet
                                </p>

                                <p className="mt-1 text-xs text-slate-400">
                                    Booking activity will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
                                            <th className="px-5 py-3 font-semibold">
                                                Reference
                                            </th>
                                            <th className="px-5 py-3 font-semibold">
                                                Campaign
                                            </th>
                                            <th className="px-5 py-3 font-semibold">
                                                Station
                                            </th>
                                            <th className="px-5 py-3 font-semibold">
                                                Status
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {bookings
                                            .slice(0, 5)
                                            .map((booking) => (
                                                <tr
                                                    key={
                                                        booking._id
                                                    }
                                                    className="border-b border-slate-50 last:border-0 dark:border-slate-800/60"
                                                >
                                                    <td className="px-5 py-4 text-xs font-medium text-slate-700 dark:text-slate-300">
                                                        {booking.bookingReference ||
                                                            booking._id}
                                                    </td>

                                                    <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                                                        {booking
                                                            .campaignId
                                                            ?.name ||
                                                            "—"}
                                                    </td>

                                                    <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                                                        {booking
                                                            .stationId
                                                            ?.name ||
                                                            "—"}
                                                    </td>

                                                    <td className="px-5 py-4">
                                                        <span
                                                            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${getBookingStatusColor(
                                                                booking.status
                                                            )}`}
                                                        >
                                                            {
                                                                booking.status
                                                            }
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Account Status */}
                    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Account Status
                            </h2>
                        </div>

                        <div className="space-y-4 p-5">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                    Current status
                                </span>

                                <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(
                                        individual.status
                                    )}`}
                                >
                                    {individual.status}
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                    Email verification
                                </span>

                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {individual.emailVerified
                                        ? "Verified"
                                        : "Not verified"}
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-500 dark:text-slate-400">
                                    Login count
                                </span>

                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {individual.loginCount || 0}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                                        Activity History
                                    </h2>

                                    <p className="mt-1 text-xs text-slate-400">
                                        Recent account activity
                                    </p>
                                </div>

                                <Activity className="h-4 w-4 text-slate-400" />
                            </div>
                        </div>

                        <div className="p-5">
                            {activities.length === 0 ? (
                                <div className="py-5 text-center">
                                    <Activity className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-700" />

                                    <p className="mt-2 text-xs text-slate-400">
                                        No activity recorded yet.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {activities
                                        .slice(0, 8)
                                        .map(
                                            (
                                                activity,
                                                index
                                            ) => (
                                                <div
                                                    key={
                                                        activity._id ||
                                                        index
                                                    }
                                                    className="flex gap-3"
                                                >
                                                    <div className="relative">
                                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/10">
                                                            <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                        </div>

                                                        {index <
                                                            Math.min(
                                                                activities.length,
                                                                8
                                                            ) -
                                                            1 && (
                                                                <div className="absolute left-1/2 top-8 h-full w-px -translate-x-1/2 bg-slate-100 dark:bg-slate-800" />
                                                            )}
                                                    </div>

                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                            {String(
                                                                activity.action ||
                                                                "ACTIVITY"
                                                            )
                                                                .replace(
                                                                    /_/g,
                                                                    " "
                                                                )}
                                                        </p>

                                                        <p className="mt-0.5 text-xs text-slate-400">
                                                            {formatDateTime(
                                                                activity.createdAt
                                                            )}
                                                        </p>

                                                        {activity.metadata
                                                            ?.campaignName && (
                                                                <p className="mt-1 truncate text-[11px] text-slate-400">
                                                                    {
                                                                        activity
                                                                            .metadata
                                                                            .campaignName
                                                                    }
                                                                </p>
                                                            )}
                                                    </div>
                                                </div>
                                            )
                                        )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Account Timeline */}
                    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Account Timeline
                            </h2>
                        </div>

                        <div className="space-y-5 p-5">
                            <div className="flex gap-3">
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/10">
                                    <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                </div>

                                <div>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Account created
                                    </p>

                                    <p className="mt-0.5 text-xs text-slate-400">
                                        {formatDateTime(
                                            individual.createdAt
                                        )}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/10">
                                    <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                </div>

                                <div>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Last login
                                    </p>

                                    <p className="mt-0.5 text-xs text-slate-400">
                                        {formatDateTime(
                                            individual.lastLogin
                                        )}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                                    <Activity className="h-3.5 w-3.5 text-slate-500" />
                                </div>

                                <div>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Profile updated
                                    </p>

                                    <p className="mt-0.5 text-xs text-slate-400">
                                        {formatDateTime(
                                            individual.updatedAt
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Account Management */}
                    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                                Account Management
                            </h2>
                        </div>

                        <div className="space-y-1 p-4">
                            <button
                                onClick={() =>
                                    router.push(
                                        `/admin/users/individuals/${individual._id}/edit`
                                    )
                                }
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
                            >
                                <Pencil className="h-4 w-4" />
                                Edit Individual
                            </button>

                            <button
                                onClick={() =>
                                    setShowResetConfirm(true)
                                }
                                disabled={
                                    actionLoading !== null
                                }
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
                            >
                                {actionLoading === "reset" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <RotateCcw className="h-4 w-4" />
                                )}
                                Reset Account
                            </button>

                            <button
                                disabled
                                title="Payment functionality is intentionally deferred"
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-400 opacity-60"
                            >
                                <CreditCard className="h-4 w-4" />
                                Payment History
                                <span className="ml-auto text-[10px]">
                                    Later
                                </span>
                            </button>

                            <button
                                onClick={() =>
                                    document
                                        .getElementById(
                                            "activity-history"
                                        )
                                        ?.scrollIntoView({
                                            behavior: "smooth",
                                        })
                                }
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
                            >
                                <Activity className="h-4 w-4" />
                                Activity History
                            </button>

                            <div className="my-2 border-t border-slate-100 dark:border-slate-800" />

                            <button
                                onClick={() =>
                                    setShowDeleteConfirm(true)
                                }
                                disabled={
                                    actionLoading !== null
                                }
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
                            >
                                {actionLoading === "delete" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                                Delete Individual
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Reset Confirmation */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/10">
                            <RotateCcw className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>

                        <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                            Reset this account?
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                            A new temporary password will be generated
                            and the individual&apos;s login information will
                            be reset.
                        </p>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() =>
                                    setShowResetConfirm(false)
                                }
                                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleReset}
                                disabled={
                                    actionLoading === "reset"
                                }
                                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                            >
                                {actionLoading === "reset" && (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                Reset Account
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 dark:bg-red-500/10">
                            <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>

                        <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                            Delete this individual?
                        </h2>

                        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                            This will permanently remove{" "}
                            <strong className="text-slate-700 dark:text-slate-200">
                                {individual.name}
                            </strong>{" "}
                            from the system. This action cannot be
                            undone.
                        </p>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() =>
                                    setShowDeleteConfirm(false)
                                }
                                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleDelete}
                                disabled={
                                    actionLoading === "delete"
                                }
                                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
                            >
                                {actionLoading === "delete" && (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                Delete Individual
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}