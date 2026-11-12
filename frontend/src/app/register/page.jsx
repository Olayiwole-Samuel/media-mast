"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Megaphone, RadioTower, Mail, User, Phone, ArrowLeft, Check } from "lucide-react";
import { saveSession } from "@/lib/auth";
import { NIGERIAN_STATES, MEDIA_TYPES } from "@/lib/nigeria";
import AuthShell from "@/components/auth/AuthShell";
import AuthInput from "@/components/auth/AuthInput";
import PasswordInput from "@/components/auth/PasswordInput";
import LoadingButton from "@/components/auth/LoadingButton";

// Sign up: choose media client, media agency or media house, then a short
// form. The account opens straight onto its verification page (CAC number,
// TIN, documents; rates for a media house) and is approved by an admin.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const KINDS = [
    {
        value: "client",
        title: "Media client",
        text: "A brand or business advertising its own products and services.",
        icon: Building2,
        businessLabel: "Business / brand name",
        businessPlaceholder: "e.g. Sunrise Foods Ltd",
    },
    {
        value: "agency",
        title: "Media agency",
        text: "An advertising or media agency booking airtime for client brands.",
        icon: Megaphone,
        businessLabel: "Agency name",
        businessPlaceholder: "e.g. Bluewave Media Ltd",
    },
    {
        value: "media_house",
        title: "Media house",
        text: "A TV, radio, newspaper, billboard or digital media owner selling ad space.",
        icon: RadioTower,
        businessLabel: "Station or media house name",
        businessPlaceholder: "e.g. Wave FM 101.5",
    },
];

const selectClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-[3px] focus:ring-emerald-500/10";

const EMPTY = { companyName: "", name: "", email: "", phone: "", password: "", mediaType: "", state: "", city: "" };

export default function RegisterPage() {
    const [kind, setKind] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const selected = KINDS.find((k) => k.value === kind);
    const isMediaHouse = kind === "media_house";

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        setErrors((prev) => ({ ...prev, [name]: "" }));
        setError("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const next = {};
        if (!form.companyName.trim()) next.companyName = `Enter the ${selected.businessLabel.toLowerCase()}`;
        if (!form.name.trim()) next.name = "Enter your full name";
        if (!form.email.trim()) next.email = "Enter your work email";
        if (!form.password) next.password = "Choose a password";
        else if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/[0-9]/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password)) {
            next.password = "Use 8+ characters with upper and lower case, a number and a symbol";
        }
        if (isMediaHouse && !form.mediaType) next.mediaType = "Choose what you run";
        if (Object.keys(next).length) {
            setErrors(next);
            return;
        }

        setLoading(true);
        setError("");
        try {
            const payload = {
                accountType: kind,
                companyName: form.companyName.trim(),
                name: form.name.trim(),
                email: form.email.trim(),
                password: form.password,
                phone: form.phone.trim(),
                ...(isMediaHouse ? { mediaType: form.mediaType, state: form.state, city: form.city.trim() } : {}),
            };
            const response = await fetch(`${API_URL}/api/v1/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            let data = null;
            try {
                data = await response.json();
            } catch {
                throw new Error("We couldn't reach Media Masters. Please try again.");
            }
            if (!response.ok) {
                const first = Array.isArray(data?.errors) && data.errors.length ? data.errors[0] : null;
                throw new Error((first && (first.message || first)) || data?.message || "Something went wrong. Please try again.");
            }
            const user = data?.data?.user;
            if (!data?.token || !user) throw new Error("Your account was created. Please sign in.");
            saveSession(data.token, user);
            window.location.assign("/verify");
        } catch (err) {
            setError(err.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const footer = (
        <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-slate-900 underline underline-offset-2">Sign in</Link>
        </>
    );

    if (!selected) {
        return (
            <AuthShell title="Create your account" subtitle="Who are you signing up as?" footer={footer} wide>
                <div className="space-y-3">
                    {KINDS.map(({ value, title, text, icon: Icon }) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => { setKind(value); setErrors({}); setError(""); }}
                            className="group flex w-full items-start gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-emerald-400 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-500/20"
                        >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100">
                                <Icon className="h-5 w-5" />
                            </span>
                            <span>
                                <span className="block font-semibold text-slate-900">{title}</span>
                                <span className="mt-0.5 block text-sm text-slate-500">{text}</span>
                            </span>
                        </button>
                    ))}
                </div>
                <p className="mt-5 text-xs text-slate-400">
                    Every account is verified before it can trade: you&apos;ll add your CAC registration number, TIN and certificate next{" "}
                    (media houses also add their rate card).
                </p>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            title={`Sign up as a ${selected.title.toLowerCase()}`}
            subtitle={selected.text}
            footer={footer}
            wide
        >
            <button type="button" onClick={() => setKind(null)} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900">
                <ArrowLeft className="h-3.5 w-3.5" /> Change account type
            </button>

            {error && (
                <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
                <AuthInput
                    label={selected.businessLabel}
                    name="companyName"
                    value={form.companyName}
                    onChange={handleChange}
                    icon={selected.icon}
                    error={errors.companyName}
                    placeholder={selected.businessPlaceholder}
                />

                {isMediaHouse && (
                    <>
                        <label className="block">
                            <span className="mb-1 block text-xs font-medium text-slate-600">What do you run?</span>
                            <select name="mediaType" value={form.mediaType} onChange={handleChange} className={selectClass} aria-invalid={!!errors.mediaType}>
                                <option value="">Choose…</option>
                                {MEDIA_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            {errors.mediaType && <span className="mt-1 block text-xs text-red-500">{errors.mediaType}</span>}
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-slate-600">State</span>
                                <select name="state" value={form.state} onChange={handleChange} className={selectClass}>
                                    <option value="">Choose…</option>
                                    {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-medium text-slate-600">City</span>
                                <input name="city" value={form.city} onChange={handleChange} maxLength={60} className={selectClass} placeholder="e.g. Ikeja" />
                            </label>
                        </div>
                    </>
                )}

                <AuthInput label="Your full name" name="name" autoComplete="name" value={form.name} onChange={handleChange} icon={User} error={errors.name} placeholder="Ada Okafor" />
                <AuthInput label="Work email" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} icon={Mail} error={errors.email} placeholder="ada@company.com" />
                <AuthInput label="Phone (optional)" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={handleChange} icon={Phone} placeholder="0803 000 0000" />
                <PasswordInput name="password" label="Password" autoComplete="new-password" value={form.password} onChange={handleChange} error={errors.password} placeholder="Create a password" />

                <ul className="space-y-1 text-xs text-slate-500">
                    {["Next: add your CAC number, TIN and certificate", isMediaHouse ? "Upload your rate card and enter your rates" : "Our team approves you, then you can book airtime"].map((t) => (
                        <li key={t} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> {t}</li>
                    ))}
                </ul>

                <LoadingButton type="submit" loading={loading} className="w-full rounded-2xl bg-slate-900 py-3 font-semibold text-white hover:bg-slate-800">
                    Create account
                </LoadingButton>
            </form>
        </AuthShell>
    );
}
