"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import AuthLayout from "@/components/auth/AuthLayout";
import AuthFormCard from "@/components/auth/AuthFormCard";
import AuthInput from "@/components/auth/AuthInput";
import AuthMessage from "@/components/auth/AuthMessage";
import NewPasswordForm from "@/components/auth/NewPasswordForm";
import { acceptInvitation } from "@/lib/api";
import { takeTokenFromUrl } from "@/lib/passwordRules";

// Opened from the invitation email (#token=…). A team member who was given
// the one-time code instead can paste it here.
export default function AcceptInvitePage() {
    const [token, setToken] = useState(null);
    const [manualCode, setManualCode] = useState("");
    const [done, setDone] = useState("");
    const read = useRef(false);

    useEffect(() => {
        if (read.current) return;
        read.current = true;
        setToken(takeTokenFromUrl());
    }, []);

    const code = (token || manualCode).trim();

    return (
        <AuthLayout>
            <AuthFormCard title="Join your team" subtitle="Choose a password to activate your Media Masters account.">
                {token === null ? null : done ? (
                    <div className="space-y-5">
                        <AuthMessage tone="success">{done}</AuthMessage>
                        <Link href="/login" className="block text-center text-sm font-semibold text-emerald-600 hover:text-emerald-700">
                            Go to sign in
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3.5">
                        {!token && (
                            <AuthInput
                                label="Invitation code"
                                name="inviteCode"
                                icon={KeyRound}
                                value={manualCode}
                                onChange={(e) => setManualCode(e.target.value)}
                                autoComplete="one-time-code"
                                maxLength={200}
                            />
                        )}
                        <NewPasswordForm
                            askName
                            submitLabel="Accept invitation"
                            onSubmit={async ({ password, name }) => {
                                if (!code) throw new Error("Enter the invitation code from your email or from the person who invited you.");
                                try {
                                    const data = await acceptInvitation(code, password, name);
                                    setDone(data?.message || "Invitation accepted. You can now sign in.");
                                } catch (err) {
                                    if (err.status === 400 && !Array.isArray(err.data?.fieldErrors)) {
                                        throw new Error("This invitation is invalid, expired or already used. Ask your company to send a new one.");
                                    }
                                    throw err;
                                }
                            }}
                        />
                    </div>
                )}
            </AuthFormCard>
        </AuthLayout>
    );
}
