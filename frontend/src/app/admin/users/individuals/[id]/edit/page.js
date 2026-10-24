"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft,
    User,
    Mail,
    Image as ImageIcon,
    Save,
    X,
    Loader2,
    CheckCircle2,
    AlertCircle,
    ShieldCheck,
    CalendarDays,
    LogIn,
} from "lucide-react";
import { motion } from "framer-motion";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const getToken = () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
};

export default function EditIndividualPage() {
    const params = useParams();
    const router = useRouter();

    const individualId = params?.id;

    const [individual, setIndividual] = useState(null);

    const [form, setForm] = useState({
        name: "",
        email: "",
        image: "",
    });

    const [originalForm, setOriginalForm] = useState({
        name: "",
        email: "",
        image: "",
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [fieldErrors, setFieldErrors] = useState({});

    /* ============================================================
       LOAD INDIVIDUAL
    ============================================================ */

    useEffect(() => {
        if (!individualId) return;

        const fetchIndividual = async () => {
            try {
                setLoading(true);
                setError("");

                const token = getToken();

                if (!token) {
                    router.push("/login");
                    return;
                }

                const response = await fetch(
                    `${API_URL}/api/v1/admin/individuals/${individualId}`,
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
                        result.message || "Failed to load individual"
                    );
                }

                const data = result.data;

                const initialForm = {
                    name: data.name || "",
                    email: data.email || "",
                    image: data.image || "",
                };

                setIndividual(data);
                setForm(initialForm);
                setOriginalForm(initialForm);
            } catch (err) {
                console.error("Failed to load individual:", err);

                setError(
                    err.message || "Failed to load individual information."
                );
            } finally {
                setLoading(false);
            }
        };

        fetchIndividual();
    }, [individualId, router]);

    /* ============================================================
       FORM HELPERS
    ============================================================ */

    const handleChange = (field, value) => {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));

        setFieldErrors((current) => ({
            ...current,
            [field]: "",
        }));

        setError("");
        setSuccess("");
    };

    const hasChanges =
        form.name !== originalForm.name ||
        form.email !== originalForm.email ||
        form.image !== originalForm.image;

    /* ============================================================
       VALIDATION
    ============================================================ */

    const validateForm = () => {
        const errors = {};

        const name = form.name.trim();
        const email = form.email.trim().toLowerCase();
        const image = form.image.trim();

        if (!name) {
            errors.name = "Full name is required.";
        } else if (name.length < 2) {
            errors.name = "Name must contain at least 2 characters.";
        }

        if (!email) {
            errors.email = "Email address is required.";
        } else if (!/^\S+@\S+\.\S+$/.test(email)) {
            errors.email = "Enter a valid email address.";
        }

        if (image) {
            try {
                new URL(image);
            } catch {
                errors.image = "Enter a valid image URL.";
            }
        }

        setFieldErrors(errors);

        return Object.keys(errors).length === 0;
    };

    /* ============================================================
       SAVE
    ============================================================ */

    const handleSubmit = async (event) => {
        event.preventDefault();

        setError("");
        setSuccess("");

        if (!validateForm()) {
            return;
        }

        if (!hasChanges) {
            setError("No changes have been made.");
            return;
        }

        try {
            setSaving(true);

            const token = getToken();

            if (!token) {
                router.push("/login");
                return;
            }

            const response = await fetch(
                `${API_URL}/api/v1/admin/individuals/${individualId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        name: form.name.trim(),
                        email: form.email.trim().toLowerCase(),
                        image: form.image.trim() || null,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "Failed to update individual"
                );
            }

            const updated = result.data;

            const updatedForm = {
                name: updated.name || "",
                email: updated.email || "",
                image: updated.image || "",
            };

            setIndividual(updated);
            setForm(updatedForm);
            setOriginalForm(updatedForm);
            setSuccess("Individual updated successfully.");

            setTimeout(() => {
                router.push(
                    `/admin/users/individuals/${individualId}`
                );
            }, 900);
        } catch (err) {
            console.error("Failed to update individual:", err);

            setError(
                err.message ||
                "Something went wrong while updating the individual."
            );
        } finally {
            setSaving(false);
        }
    };

    /* ============================================================
       CANCEL
    ============================================================ */

    const handleCancel = () => {
        if (hasChanges) {
            const confirmed = window.confirm(
                "You have unsaved changes. Are you sure you want to leave?"
            );

            if (!confirmed) return;
        }

        router.push(`/admin/users/individuals/${individualId}`);
    };

    /* ============================================================
       INITIALS
    ============================================================ */

    const getInitials = (name = "") => {
        const parts = name
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!parts.length) return "IN";

        return parts
            .slice(0, 2)
            .map((part) => part.charAt(0))
            .join("")
            .toUpperCase();
    };

    /* ============================================================
       LOADING
    ============================================================ */

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f7fcfa] p-4 sm:p-6 lg:p-8">
                <div className="mx-auto flex min-h-[70vh] max-w-6xl items-center justify-center">
                    <div className="text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
                            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                        </div>

                        <p className="mt-4 text-sm font-semibold text-slate-700">
                            Loading individual
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                            Please wait...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    /* ============================================================
       ERROR / NOT FOUND
    ============================================================ */

    if (!individual) {
        return (
            <div className="min-h-screen bg-[#f7fcfa] p-4 sm:p-6 lg:p-8">
                <div className="mx-auto max-w-6xl">
                    <button
                        onClick={() =>
                            router.push("/admin/users/individuals")
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Individuals
                    </button>

                    <div className="mt-6 rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                            <AlertCircle className="h-6 w-6 text-red-500" />
                        </div>

                        <h2 className="mt-4 text-lg font-bold text-slate-900">
                            Individual not found
                        </h2>

                        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                            {error ||
                                "We couldn't load this individual account."}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f7fcfa] p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-6xl">

                {/* ====================================================
                    TOP NAVIGATION
                ==================================================== */}

                <div className="mb-6">
                    <button
                        onClick={handleCancel}
                        className="group inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-emerald-700"
                    >
                        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                        Back to Individual
                    </button>
                </div>

                {/* ====================================================
                    HEADER
                ==================================================== */}

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-100 text-lg font-bold text-emerald-700 ring-4 ring-emerald-50">
                            {form.image ? (
                                <img
                                    src={form.image}
                                    alt={form.name}
                                    className="h-full w-full object-cover"
                                    onError={(event) => {
                                        event.currentTarget.style.display =
                                            "none";
                                    }}
                                />
                            ) : (
                                getInitials(form.name)
                            )}
                        </div>

                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                                    Edit Individual
                                </h1>

                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                                    Individual
                                </span>
                            </div>

                            <p className="mt-1 text-sm text-slate-500">
                                Update account information for{" "}
                                <span className="font-medium text-slate-700">
                                    {individual.name}
                                </span>
                            </p>
                        </div>
                    </div>

                    <div
                        className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${individual.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                    >
                        <span className="h-2 w-2 rounded-full bg-current" />
                        {individual.status}
                    </div>
                </motion.div>

                {/* ====================================================
                    ALERTS
                ==================================================== */}

                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-5 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-red-700">
                                Unable to save changes
                            </p>

                            <p className="mt-0.5 text-sm text-red-600">
                                {error}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => setError("")}
                            className="rounded-lg p-1.5 text-red-400 transition hover:bg-red-100 hover:text-red-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </motion.div>
                )}

                {success && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"
                    >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        </div>

                        <div>
                            <p className="text-sm font-bold text-emerald-700">
                                Changes saved
                            </p>

                            <p className="mt-0.5 text-sm text-emerald-600">
                                {success}
                            </p>
                        </div>
                    </motion.div>
                )}

                {/* ====================================================
                    CONTENT
                ==================================================== */}

                <form onSubmit={handleSubmit}>
                    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">

                        {/* ==================================================
                            LEFT — EDIT FORM
                        ================================================== */}

                        <motion.div
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 }}
                            className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"
                        >
                            <div className="border-b border-emerald-50 bg-gradient-to-r from-emerald-50/70 to-white px-5 py-5 sm:px-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                                        <User className="h-5 w-5 text-emerald-600" />
                                    </div>

                                    <div>
                                        <h2 className="font-bold text-slate-900">
                                            Personal Information
                                        </h2>

                                        <p className="mt-0.5 text-xs text-slate-500">
                                            Update the information associated
                                            with this account.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6 p-5 sm:p-6">

                                {/* NAME */}

                                <div>
                                    <label
                                        htmlFor="name"
                                        className="mb-2 block text-sm font-semibold text-slate-700"
                                    >
                                        Full Name
                                    </label>

                                    <div className="relative">
                                        <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />

                                        <input
                                            id="name"
                                            type="text"
                                            value={form.name}
                                            onChange={(event) =>
                                                handleChange(
                                                    "name",
                                                    event.target.value
                                                )
                                            }
                                            placeholder="Enter full name"
                                            className={`w-full rounded-xl border bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 ${fieldErrors.name
                                                    ? "border-red-300 focus:border-red-500 focus:ring-red-50"
                                                    : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-50"
                                                }`}
                                        />
                                    </div>

                                    {fieldErrors.name && (
                                        <p className="mt-1.5 text-xs font-medium text-red-500">
                                            {fieldErrors.name}
                                        </p>
                                    )}
                                </div>

                                {/* EMAIL */}

                                <div>
                                    <label
                                        htmlFor="email"
                                        className="mb-2 block text-sm font-semibold text-slate-700"
                                    >
                                        Email Address
                                    </label>

                                    <div className="relative">
                                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />

                                        <input
                                            id="email"
                                            type="email"
                                            value={form.email}
                                            onChange={(event) =>
                                                handleChange(
                                                    "email",
                                                    event.target.value
                                                )
                                            }
                                            placeholder="Enter email address"
                                            className={`w-full rounded-xl border bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 ${fieldErrors.email
                                                    ? "border-red-300 focus:border-red-500 focus:ring-red-50"
                                                    : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-50"
                                                }`}
                                        />
                                    </div>

                                    {fieldErrors.email && (
                                        <p className="mt-1.5 text-xs font-medium text-red-500">
                                            {fieldErrors.email}
                                        </p>
                                    )}

                                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50/70 px-3 py-2">
                                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />

                                        <p className="text-[11px] leading-4 text-emerald-700">
                                            This email address is used for
                                            account login and communication.
                                        </p>
                                    </div>
                                </div>

                                {/* IMAGE */}

                                <div>
                                    <label
                                        htmlFor="image"
                                        className="mb-2 block text-sm font-semibold text-slate-700"
                                    >
                                        Profile Image URL
                                    </label>

                                    <div className="relative">
                                        <ImageIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />

                                        <input
                                            id="image"
                                            type="url"
                                            value={form.image}
                                            onChange={(event) =>
                                                handleChange(
                                                    "image",
                                                    event.target.value
                                                )
                                            }
                                            placeholder="https://example.com/profile.jpg"
                                            className={`w-full rounded-xl border bg-white py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 ${fieldErrors.image
                                                    ? "border-red-300 focus:border-red-500 focus:ring-red-50"
                                                    : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-50"
                                                }`}
                                        />
                                    </div>

                                    {fieldErrors.image && (
                                        <p className="mt-1.5 text-xs font-medium text-red-500">
                                            {fieldErrors.image}
                                        </p>
                                    )}

                                    <p className="mt-2 text-xs text-slate-400">
                                        Enter a publicly accessible image URL.
                                    </p>
                                </div>
                            </div>
                        </motion.div>

                        {/* ==================================================
                            RIGHT — ACCOUNT INFORMATION
                        ================================================== */}

                        <div className="space-y-6">

                            {/* ACCOUNT SUMMARY */}

                            <motion.div
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"
                            >
                                <div className="border-b border-emerald-50 bg-emerald-50/60 px-5 py-5">
                                    <h2 className="font-bold text-slate-900">
                                        Account Information
                                    </h2>

                                    <p className="mt-1 text-xs text-slate-500">
                                        System-managed account details.
                                    </p>
                                </div>

                                <div className="divide-y divide-slate-100">

                                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                                                <User className="h-4 w-4 text-emerald-600" />
                                            </div>

                                            <span className="text-xs font-medium text-slate-500">
                                                Account Type
                                            </span>
                                        </div>

                                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                                            INDIVIDUAL
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                            </div>

                                            <span className="text-xs font-medium text-slate-500">
                                                Status
                                            </span>
                                        </div>

                                        <span
                                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${individual.status === "ACTIVE"
                                                    ? "bg-emerald-50 text-emerald-700"
                                                    : "bg-slate-100 text-slate-600"
                                                }`}
                                        >
                                            {individual.status}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                                                <LogIn className="h-4 w-4 text-emerald-600" />
                                            </div>

                                            <span className="text-xs font-medium text-slate-500">
                                                Login Count
                                            </span>
                                        </div>

                                        <span className="text-sm font-bold text-slate-800">
                                            {individual.loginCount ?? 0}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                                                <CalendarDays className="h-4 w-4 text-emerald-600" />
                                            </div>

                                            <span className="text-xs font-medium text-slate-500">
                                                Member Since
                                            </span>
                                        </div>

                                        <span className="text-xs font-bold text-slate-700">
                                            {individual.createdAt
                                                ? new Date(
                                                    individual.createdAt
                                                ).toLocaleDateString(
                                                    "en-NG",
                                                    {
                                                        day: "numeric",
                                                        month: "short",
                                                        year: "numeric",
                                                    }
                                                )
                                                : "—"}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>

                            {/* LIVE PREVIEW */}

                            <motion.div
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"
                            >
                                <div className="mb-4">
                                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                                        Live Preview
                                    </p>

                                    <p className="mt-1 text-xs text-slate-400">
                                        How the profile currently looks.
                                    </p>
                                </div>

                                <div className="rounded-xl border border-emerald-50 bg-[#f7fcfa] p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-100 font-bold text-emerald-700">
                                            {form.image ? (
                                                <img
                                                    src={form.image}
                                                    alt={form.name}
                                                    className="h-full w-full object-cover"
                                                    onError={(event) => {
                                                        event.currentTarget.style.display =
                                                            "none";
                                                    }}
                                                />
                                            ) : (
                                                getInitials(form.name)
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-slate-900">
                                                {form.name ||
                                                    "Individual Name"}
                                            </p>

                                            <p className="truncate text-xs text-slate-500">
                                                {form.email ||
                                                    "email@example.com"}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>

                    {/* ====================================================
                        ACTION BAR
                    ==================================================== */}

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mt-6 flex flex-col-reverse gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div>
                            {hasChanges ? (
                                <p className="flex items-center gap-2 text-xs font-medium text-amber-600">
                                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                                    You have unsaved changes
                                </p>
                            ) : (
                                <p className="text-xs text-slate-400">
                                    No changes to save
                                </p>
                            )}
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={saving}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <X className="h-4 w-4" />
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={saving || !hasChanges}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4" />
                                        Save Changes
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </form>
            </div>
        </div>
    );
}