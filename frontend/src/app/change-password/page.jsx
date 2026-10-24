"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AuthLayout from "@/components/auth/AuthLayout";
import AuthFormCard from "@/components/auth/AuthFormCard";
import AuthMessage from "@/components/auth/AuthMessage";
import NewPasswordForm from "@/components/auth/NewPasswordForm";
import { changePassword } from "@/lib/api";
import { clearSession, homeRouteFor, useSession } from "@/lib/auth";

// Signed-in password change. Required (and the only page available) while
// the account still has a password an admin set; optional otherwise.
export default function ChangePasswordPage() {
    const router = useRouter();
    const { ready, user, hasToken } = useSession();
    const signedIn = ready && hasToken && !!user;
    const required = signedIn && user.mustChangePassword === true;

    useEffect(() => {
        if (ready && !signedIn) router.replace("/login");
    }, [ready, signedIn, router]);

    if (!signedIn) return null;

    return (
        <AuthLayout>
            <AuthFormCard
                title={required ? "Set your own password" : "Change password"}
                subtitle={required
                    ? "Your account was created with a temporary password. Choose your own to continue."
                    : "You'll be signed out everywhere and asked to sign in again."}
            >
                <div className="space-y-4">
                    {required && (
                        <AuthMessage tone="info">
                            Enter the temporary password you were given as your current password.
                        </AuthMessage>
                    )}
                    <NewPasswordForm
                        askCurrent
                        submitLabel="Change password"
                        onSubmit={async ({ currentPassword, password }) => {
                            await changePassword(currentPassword, password);
                            // The server ended every session, including this one.
                            clearSession();
                            window.location.assign("/login?reason=password-changed");
                        }}
                    />
                    {!required && (
                        <Link href={homeRouteFor(user)} className="block text-center text-sm font-semibold text-slate-500 hover:text-slate-700">
                            Cancel
                        </Link>
                    )}
                </div>
            </AuthFormCard>
        </AuthLayout>
    );
}
