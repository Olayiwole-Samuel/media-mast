"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { saveSession, homeRouteFor } from "@/lib/auth";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { LogIn, UserPlus, ArrowLeft, ArrowRight, Mail, Building2, User } from "lucide-react";

// Importing components
import AuthInput from "@/components/auth/AuthInput";
import PasswordInput from "@/components/auth/PasswordInput";
import RememberMe from "@/components/auth/RememberMe";
import GoogleButton from "@/components/auth/GoogleButton";
import LoadingButton from "@/components/auth/LoadingButton";
import Divider from "@/components/auth/Divider";

const testimonials = [
    {
        quote:
            "“With App, I can manage my global portfolio and complete secure transactions in minutes. It's the perfect blend of modern speed and seamless design.”",
        author: "Liam Smith",
        role: "Investor",
        company: "Global Investment Firm",
        image: "/login1.jpg",
    },
    {
        quote:
            "“The most intuitive platform for scaling media and enterprise campaigns with zero friction.”",
        author: "Sarah Chen",
        role: "Head of Operations",
        company: "Apex Digital",
        image: "/login2.jpg",
    },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export default function LoginPage() {
    const reduced = useReducedMotion();
    const [activeTab, setActiveTab] = useState("login"); // "login" | "signup"
    const [accountType, setAccountType] = useState("individual"); // "individual" | "company"
    const [testimonialIdx, setTestimonialIdx] = useState(0);
    const [loading, setLoading] = useState(false);
    const [remember, setRemember] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    // "?reason=expired" is set by lib/api.js when a session token is rejected.
    const search = useSyncExternalStore(
        () => () => {},
        () => window.location.search,
        () => ""
    );
    const reason = new URLSearchParams(search).get("reason");
    const sessionExpired = reason === "expired";
    const passwordChanged = reason === "password-changed";

    const [form, setForm] = useState({
        fullName: "",
        companyName: "",
        email: "",
        password: "",
        phone: "",
    });

    const [errors, setErrors] = useState({});

    const currentTestimonial = testimonials[testimonialIdx];

    const handleNextTestimonial = () => {
        setTestimonialIdx((prev) => (prev + 1) % testimonials.length);
    };

    const handlePrevTestimonial = () => {
        setTestimonialIdx(
            (prev) => (prev - 1 + testimonials.length) % testimonials.length
        );
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        setErrors((prev) => ({ ...prev, [name]: "" }));
        setError("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // ── Validation ──
        const newErrors = {};
        if (!form.email.trim()) newErrors.email = "Email is required";
        if (!form.password.trim()) newErrors.password = "Password is required";

        if (activeTab === "signup") {
            if (accountType === "individual") {
                if (!form.fullName?.trim()) {
                    newErrors.fullName = "Full name is required";
                }
            } else {
                // COMPANY
                if (!form.companyName?.trim()) {
                    newErrors.companyName = "Company name is required";
                }
                if (!form.fullName?.trim()) {
                    newErrors.fullName = "Owner name is required";
                }
            }
        }

        if (Object.keys(newErrors).length) {
            setErrors(newErrors);
            return;
        }

        setLoading(true);
        setError("");
        setErrors({});

        try {
            let url = `${API_URL}/api/v1/auth/`;
            let payload = {};

            if (activeTab === "signup") {
                url += "register";
                
                if (accountType === "individual") {
                    payload = {
                        accountType: "individual",
                        name: form.fullName,
                        email: form.email,
                        password: form.password,
                        phone: form.phone || "",
                    };
                } else {
                    // COMPANY
                    payload = {
                        accountType: "company",
                        name: form.fullName,        // Owner name
                        companyName: form.companyName,
                        email: form.email,
                        password: form.password,
                        phone: form.phone || "",
                    };
                }
            } else {
                // ── LOGIN ──
                url += "login";
                payload = {
                    email: form.email,
                    password: form.password,
                };
            }

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error("We couldn't reach Media Masters. Please try again.");
            }

            if (!response.ok) {
                if (Array.isArray(data?.errors) && data.errors.length) {
                    throw new Error(data.errors[0]);
                }
                throw new Error(data?.message || "Something went wrong. Please try again.");
            }

            const user = data?.data?.user;

            // A new company must be approved before it can sign in, so its
            // registration token is not kept.
            if (activeTab === "signup" && user?.accountType === "COMPANY") {
                setNotice(
                    "Your company has been registered. We'll review it and you can sign in once it's approved."
                );
                setActiveTab("login");
                setForm((prev) => ({ ...prev, password: "" }));
                return;
            }

            if (!data?.token || !user) {
                throw new Error("Something went wrong. Please try again.");
            }

            saveSession(data.token, user);
            // A password set by an admin (station managers, admin-created
            // workers, reset accounts) must be replaced before anything else.
            window.location.assign(user.mustChangePassword ? "/change-password" : homeRouteFor(user));
        } catch (err) {
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-slate-100 p-4 lg:p-6">
            <div className="grid w-full max-w-6xl grid-cols-1 overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-2">
                {/* Left Side: Form Container */}
                <div className="relative flex flex-col justify-between p-8 sm:p-12 lg:p-14">
                    {/* Back to Home Button */}
                    <div className="mb-6 flex items-center justify-between">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span>Back to Home</span>
                        </Link>
                    </div>

                    {/* Top Switcher: Tab & Account Type */}
                    <div className="flex flex-col items-center gap-3">
                        {/* Login / Signup Pill */}
                        <div className="inline-flex items-center rounded-2xl bg-slate-100 p-1.5 border border-slate-200/60">
                            <button
                                type="button"
                                onClick={() => setActiveTab("login")}
                                className={`relative flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-semibold transition-colors duration-200 ${
                                    activeTab === "login"
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                <LogIn className="h-3.5 w-3.5" />
                                <span>Login</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("signup")}
                                className={`relative flex items-center gap-2 rounded-xl px-5 py-2 text-xs font-semibold transition-colors duration-200 ${
                                    activeTab === "signup"
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                                <UserPlus className="h-3.5 w-3.5" />
                                <span>Sign Up</span>
                            </button>
                        </div>

                        {/* Individual vs Company Selector */}
                        <div className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-xl bg-slate-100/80 p-1 border border-slate-200/40 text-xs">
                            <button
                                type="button"
                                onClick={() => setAccountType("individual")}
                                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition-all ${
                                    accountType === "individual"
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                }`}
                            >
                                <User className="h-3.5 w-3.5" />
                                <span>Individual</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setAccountType("company")}
                                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition-all ${
                                    accountType === "company"
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                }`}
                            >
                                <Building2 className="h-3.5 w-3.5" />
                                <span>Company</span>
                            </button>
                        </div>
                    </div>

                    {/* Form Header & Content */}
                    <div className="my-6 w-full max-w-md mx-auto space-y-4">
                        <div className="text-center">
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                                {activeTab === "login"
                                    ? accountType === "company"
                                        ? "Company Portal Login"
                                        : "Welcome Back!"
                                    : accountType === "company"
                                    ? "Register Company"
                                    : "Create Account"}
                            </h1>
                            <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
                                {activeTab === "login"
                                    ? `Enter your ${accountType === "company" ? "work " : ""}details to log in.`
                                    : `Fill out the form below to create your ${accountType} account.`}
                            </p>
                        </div>

                        {/* Notices */}
                        {(notice || ((sessionExpired || passwordChanged) && !error)) && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                                {notice || (passwordChanged ? "Your password has been changed. Please sign in with your new password." : "Your session has ended. Please sign in again.")}
                            </div>
                        )}

                        {/* Error Message */}
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-3.5">
                            {/* Signup Specific Fields */}
                            {activeTab === "signup" && (
                                <>
                                    {accountType === "company" ? (
                                        <>
                                            <AuthInput
                                                label="Company Name"
                                                name="companyName"
                                                type="text"
                                                value={form.companyName}
                                                onChange={handleChange}
                                                icon={Building2}
                                                error={errors.companyName}
                                                placeholder="e.g. Acme Corp"
                                            />
                                            <AuthInput
                                                label="Owner Full Name"
                                                name="fullName"
                                                type="text"
                                                value={form.fullName}
                                                onChange={handleChange}
                                                icon={User}
                                                error={errors.fullName}
                                                placeholder="John Doe"
                                            />
                                        </>
                                    ) : (
                                        <AuthInput
                                            label="Full Name"
                                            name="fullName"
                                            type="text"
                                            value={form.fullName}
                                            onChange={handleChange}
                                            icon={User}
                                            error={errors.fullName}
                                            placeholder="John Doe"
                                        />
                                    )}
                                </>
                            )}

                            {/* Email Field */}
                            <AuthInput
                                label={accountType === "company" ? "Work Email Address" : "Email Address"}
                                name="email"
                                type="email"
                                value={form.email}
                                onChange={handleChange}
                                icon={Mail}
                                error={errors.email}
                                placeholder={accountType === "company" ? "alex@company.com" : "you@example.com"}
                            />

                            {/* Password Input */}
                            <div>
                                <div className="mb-1 flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-700"></span>
                                    {activeTab === "login" && (
                                        <Link
                                            href="/forgot-password"
                                            className="text-xs font-semibold text-slate-900 hover:underline"
                                        >
                                            Forgot password?
                                        </Link>
                                    )}
                                </div>
                                <PasswordInput
                                    name="password"
                                    label="Password"
                                    value={form.password}
                                    onChange={handleChange}
                                    error={errors.password}
                                    placeholder="Enter your password"
                                />
                            </div>

                            {/* Remember Me Checkbox */}
                            {activeTab === "login" && (
                                <div className="pt-0.5">
                                    <RememberMe
                                        checked={remember}
                                        onChange={(e) => setRemember(e.target.checked)}
                                    />
                                </div>
                            )}

                            {/* Submit Button */}
                            <LoadingButton
                                type="submit"
                                loading={loading}
                                className="mt-2 w-full rounded-2xl bg-slate-900 py-3 font-semibold text-white hover:bg-slate-800"
                            >
                                {activeTab === "login"
                                    ? `Log In as ${accountType === "company" ? "Company" : "Individual"}`
                                    : `Sign Up as ${accountType === "company" ? "Company" : "Individual"}`}
                            </LoadingButton>
                        </form>

                        <Divider text="OR" />

                        {/* Social Logins */}
                        <div className="space-y-2">
                            <GoogleButton />
                        </div>
                    </div>

                    {/* Bottom Switch Link */}
                    <div className="text-center text-xs text-slate-500">
                        {activeTab === "login" ? (
                            <>
                                Don&apos;t have an account yet?{" "}
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("signup")}
                                    className="font-semibold text-slate-900 underline underline-offset-2"
                                >
                                    Sign up
                                </button>
                            </>
                        ) : (
                            <>
                                Already have an account?{" "}
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("login")}
                                    className="font-semibold text-slate-900 underline underline-offset-2"
                                >
                                    Log in
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Right Side: Hero Image Banner */}
                <div className="relative hidden min-h-[640px] w-full overflow-hidden rounded-3xl p-6 lg:block">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={testimonialIdx}
                            initial={reduced ? false : { opacity: 0, scale: 1.05 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={reduced ? false : { opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.6 }}
                            className="absolute inset-0"
                        >
                            <Image
                                src={currentTestimonial.image}
                                alt="Hero banner"
                                fill
                                priority
                                className="object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        </motion.div>
                    </AnimatePresence>

                    {/* Glassmorphism Quote Box */}
                    <div className="absolute bottom-8 left-8 right-8 rounded-3xl border border-white/20 bg-white/10 p-6 backdrop-blur-xl">
                        <p className="text-sm leading-relaxed text-white/90">
                            {currentTestimonial.quote}
                        </p>

                        <div className="mt-6 flex items-end justify-between">
                            <div>
                                <h3 className="text-base font-bold text-white">
                                    {currentTestimonial.author}
                                </h3>
                                <p className="text-xs text-white/70">
                                    {currentTestimonial.role}
                                </p>
                                <p className="text-xs text-white/50">
                                    {currentTestimonial.company}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handlePrevTestimonial}
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white transition hover:bg-white/20"
                                    aria-label="Previous testimonial"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleNextTestimonial}
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white transition hover:bg-white/20"
                                    aria-label="Next testimonial"
                                >
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}