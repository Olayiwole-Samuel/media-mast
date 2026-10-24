"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import AuthLayout from "@/components/auth/AuthLayout";
import AuthFormCard from "@/components/auth/AuthFormCard";
import AuthMessage from "@/components/auth/AuthMessage";
import NewPasswordForm from "@/components/auth/NewPasswordForm";
import { resetPassword } from "@/lib/api";
import { takeTokenFromUrl } from "@/lib/passwordRules";

export default function ResetPasswordPage() {
    // null = not read yet, "" = the link had no token
    const [token, setToken] = useState(null);
    const [done, setDone] = useState("");
    const read = useRef(false);

    useEffect(() => {
        if (read.current) return;
        read.current = true;
        // Read once, then the token is removed from the address bar.
        setToken(takeTokenFromUrl());
    }, []);

    return (
        <AuthLayout>
            <AuthFormCard title="Choose a new password" subtitle="Your new password replaces the old one and signs you out everywhere.">
                {token === null ? null : done ? (
                    <div className="space-y-5">
                        <AuthMessage tone="success">{done}</AuthMessage>
                        <Link href="/login" className="block text-center text-sm font-semibold text-emerald-600 hover:text-emerald-700">
                            Go to sign in
                        </Link>
                    </div>
                ) : !token ? (
                    <div className="space-y-5">
                        <AuthMessage>This reset link is incomplete. Open the link from your email again, or request a new one.</AuthMessage>
                        <Link href="/forgot-password" className="block text-center text-sm font-semibold text-emerald-600 hover:text-emerald-700">
                            Request a new link
                        </Link>
                    </div>
                ) : (
                    <>
                        <NewPasswordForm
                            submitLabel="Reset password"
                            onSubmit={async ({ password }) => {
                                try {
                                    const data = await resetPassword(token, password);
                                    setDone(data?.message || "Password has been reset. Please sign in with your new password.");
                                } catch (err) {
                                    if (err.status === 400 && /invalid or expired/i.test(err.message)) {
                                        throw new Error("This reset link has expired or was already used. Request a new one.");
                                    }
                                    throw err;
                                }
                            }}
                        />
                        <p className="mt-5 text-center text-sm text-slate-500">
                            Link expired?{" "}
                            <Link href="/forgot-password" className="font-semibold text-emerald-600 hover:text-emerald-700">
                                Request a new one
                            </Link>
                        </p>
                    </>
                )}
            </AuthFormCard>
        </AuthLayout>
    );
}
