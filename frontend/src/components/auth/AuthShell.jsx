"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Building2, Megaphone, RadioTower } from "lucide-react";

// Shared frame for sign-in and sign-up: the form on the left, a picture and
// the three kinds of account on the right (hidden on small screens).

const KINDS = [
    { icon: Building2, title: "Media clients", text: "Brands and businesses advertising their products." },
    { icon: Megaphone, title: "Media agencies", text: "Agencies booking airtime for their client brands." },
    { icon: RadioTower, title: "Media houses", text: "TV, radio, press and billboard owners selling space." },
];

export default function AuthShell({ title, subtitle, children, footer, wide = false }) {
    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-slate-100 p-4 lg:p-6">
            <div className="grid w-full max-w-6xl grid-cols-1 overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-2">
                <div className={`relative flex flex-col justify-between p-6 sm:p-10 ${wide ? "lg:p-10" : "lg:p-14"}`}>
                    <Link href="/" className="inline-flex w-fit items-center gap-2 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900">
                        <ArrowLeft className="h-4 w-4" />
                        Back to home
                    </Link>

                    <div className={`mx-auto my-8 w-full ${wide ? "max-w-lg" : "max-w-sm"}`}>
                        <h1 className="text-3xl font-black tracking-tight text-slate-900">{title}</h1>
                        {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
                        <div className="mt-7">{children}</div>
                    </div>

                    {footer && <div className="text-center text-xs text-slate-500">{footer}</div>}
                </div>

                <div className="relative hidden min-h-[640px] overflow-hidden lg:block">
                    <Image src="/login1.jpg" alt="" fill priority unoptimized className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent" />
                    <div className="absolute bottom-8 left-8 right-8 space-y-3">
                        <p className="text-lg font-bold text-white">One place to buy and sell airtime across Nigeria.</p>
                        {KINDS.map(({ icon: Icon, title: t, text }) => (
                            <div key={t} className="flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-xl">
                                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                                <div>
                                    <p className="text-sm font-semibold text-white">{t}</p>
                                    <p className="text-xs text-white/70">{text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
