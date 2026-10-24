"use client";

import { useState } from "react";
import { User } from "lucide-react";

import AuthInput from "@/components/auth/AuthInput";
import PasswordInput from "@/components/auth/PasswordInput";
import AuthMessage from "@/components/auth/AuthMessage";
import LoadingButton from "@/components/auth/LoadingButton";
import { PASSWORD_HINT, passwordProblem } from "@/lib/passwordRules";

// New password + confirmation (and optionally the current password or a
// name). onSubmit receives { currentPassword, password, name } and should
// throw an Error whose message is shown to the user.
export default function NewPasswordForm({
    onSubmit,
    submitLabel = "Save password",
    askCurrent = false,
    askName = false,
}) {
    const [form, setForm] = useState({ currentPassword: "", password: "", confirm: "", name: "" });
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const set = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        setErrors((prev) => ({ ...prev, [name]: "" }));
        setError("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const next = {};
        if (askCurrent && !form.currentPassword) next.currentPassword = "Current password is required";
        const problem = passwordProblem(form.password);
        if (problem) next.password = problem;
        if (!next.password && form.password !== form.confirm) next.confirm = "Passwords do not match";
        if (askCurrent && !next.password && form.password && form.password === form.currentPassword) {
            next.password = "New password must be different from the current password";
        }
        if (Object.keys(next).length) {
            setErrors(next);
            return;
        }

        setLoading(true);
        try {
            await onSubmit({ currentPassword: form.currentPassword, password: form.password, name: form.name.trim() });
        } catch (err) {
            setError(err.status === 429
                ? "Too many attempts. Please wait a few minutes and try again."
                : err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
            <AuthMessage>{error}</AuthMessage>
            {askName && (
                <AuthInput
                    label="Your name (optional)"
                    name="name"
                    icon={User}
                    value={form.name}
                    onChange={set}
                    autoComplete="name"
                    disabled={loading}
                    maxLength={100}
                />
            )}
            {askCurrent && (
                <PasswordInput
                    name="currentPassword"
                    label="Current password"
                    value={form.currentPassword}
                    onChange={set}
                    error={errors.currentPassword}
                    autoComplete="current-password"
                    disabled={loading}
                />
            )}
            <PasswordInput
                name="password"
                label="New password"
                value={form.password}
                onChange={set}
                error={errors.password}
                autoComplete="new-password"
                disabled={loading}
            />
            <PasswordInput
                name="confirm"
                label="Confirm new password"
                value={form.confirm}
                onChange={set}
                error={errors.confirm}
                autoComplete="new-password"
                disabled={loading}
            />
            <p className="pl-1 text-[12.5px] leading-relaxed text-slate-500">{PASSWORD_HINT}</p>
            <LoadingButton type="submit" loading={loading} loadingText="Saving…">
                {submitLabel}
            </LoadingButton>
        </form>
    );
}
