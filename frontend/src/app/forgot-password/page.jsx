"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";

import AuthLayout from "@/components/auth/AuthLayout";
import AuthFormCard from "@/components/auth/AuthFormCard";
import AuthInput from "@/components/auth/AuthInput";
import AuthMessage from "@/components/auth/AuthMessage";
import LoadingButton from "@/components/auth/LoadingButton";
import { requestPasswordReset } from "@/lib/api";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [fieldError, setFieldError] = useState("");
    const [error, setError] = useState("");
    const [sentMessage, setSentMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const value = email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            setFieldError("Please enter a valid email address");
            return;
        }

        setLoading(true);
        setError("");
        try {
            const data = await requestPasswordReset(value);
            // The server answers the same way whether or not the account exists.
            setSentMessage(data?.message || "If an account exists for that email, password reset instructions will be sent.");
        } catch (err) {
            setError(err.status === 429
                ? "Too many attempts. Please wait a few minutes and try again."
                : err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout>
            <AuthFormCard
                title="Forgot your password?"
                subtitle="Enter the email you sign in with and we'll send you a link to choose a new one."
            >
                {sentMessage ? (
                    <div className="space-y-5">
                        <AuthMessage tone="success">
                            {sentMessage} Check your inbox (and spam folder). The link expires soon and works once.
                        </AuthMessage>
                        <Link href="/login" className="block text-center text-sm font-semibold text-emerald-600 hover:text-emerald-700">
                            Back to sign in
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <AuthMessage>{error}</AuthMessage>
                        <AuthInput
                            label="Email address"
                            name="email"
                            type="email"
                            icon={Mail}
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setFieldError(""); setError(""); }}
                            error={fieldError}
                            disabled={loading}
                        />
                        <LoadingButton type="submit" loading={loading} loadingText="Sending…">
                            Send reset link
                        </LoadingButton>
                        <p className="text-center text-sm text-slate-500">
                            Remembered it?{" "}
                            <Link href="/login" className="font-semibold text-emerald-600 hover:text-emerald-700">
                                Sign in
                            </Link>
                        </p>
                    </form>
                )}
            </AuthFormCard>
        </AuthLayout>
    );
}
