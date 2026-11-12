"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { saveSession, homeRouteFor } from "@/lib/auth";
import AuthShell from "@/components/auth/AuthShell";
import AuthInput from "@/components/auth/AuthInput";
import PasswordInput from "@/components/auth/PasswordInput";
import LoadingButton from "@/components/auth/LoadingButton";

// Sign in: media clients, media agencies, media houses (and admins).
// One form for everyone; the account type decides where it lands. A
// business still awaiting approval lands on its verification page.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function LoginPage() {
    const [form, setForm] = useState({ email: "", password: "" });
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // "?reason=expired" is set by lib/api.js when a session token is rejected.
    const search = useSyncExternalStore(() => () => {}, () => window.location.search, () => "");
    const reason = new URLSearchParams(search).get("reason");
    const notice = reason === "expired"
        ? "Your session has ended. Please sign in again."
        : reason === "password-changed"
        ? "Your password has been changed. Please sign in with your new password."
        : "";

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        setErrors((prev) => ({ ...prev, [name]: "" }));
        setError("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const next = {};
        if (!form.email.trim()) next.email = "Enter your email address";
        if (!form.password) next.password = "Enter your password";
        if (Object.keys(next).length) {
            setErrors(next);
            return;
        }

        setLoading(true);
        setError("");
        try {
            const response = await fetch(`${API_URL}/api/v1/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: form.email.trim(), password: form.password }),
            });
            let data = null;
            try {
                data = await response.json();
            } catch {
                throw new Error("We couldn't reach Media Masters. Please try again.");
            }
            if (!response.ok) {
                throw new Error(data?.message || "Something went wrong. Please try again.");
            }
            const user = data?.data?.user;
            if (!data?.token || !user) throw new Error("Something went wrong. Please try again.");

            saveSession(data.token, user);
            window.location.assign(user.mustChangePassword ? "/change-password" : homeRouteFor(user));
        } catch (err) {
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            title="Welcome back"
            subtitle="Sign in to your Media Masters account."
            footer={
                <>
                    New to Media Masters?{" "}
                    <Link href="/register" className="font-semibold text-slate-900 underline underline-offset-2">
                        Create an account
                    </Link>
                </>
            }
        >
            {notice && !error && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>
            )}
            {error && (
                <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <AuthInput
                    label="Email address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={handleChange}
                    icon={Mail}
                    error={errors.email}
                    placeholder="you@company.com"
                />
                <div>
                    <div className="mb-1 flex justify-end">
                        <Link href="/forgot-password" className="text-xs font-semibold text-slate-900 hover:underline">
                            Forgot password?
                        </Link>
                    </div>
                    <PasswordInput
                        name="password"
                        label="Password"
                        autoComplete="current-password"
                        value={form.password}
                        onChange={handleChange}
                        error={errors.password}
                        placeholder="Enter your password"
                    />
                </div>
                <LoadingButton type="submit" loading={loading} className="w-full rounded-2xl bg-slate-900 py-3 font-semibold text-white hover:bg-slate-800">
                    Sign in
                </LoadingButton>
            </form>
        </AuthShell>
    );
}
