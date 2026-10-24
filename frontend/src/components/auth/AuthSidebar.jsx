"use client";

import { ShieldCheck, RadioTower, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const STATS_DATA = [
    {
        icon: RadioTower,
        value: "3,000+",
        label: "Media Stations",
    },
    {
        icon: Users,
        value: "500+",
        label: "Agencies",
    },
    {
        icon: ShieldCheck,
        value: "100%",
        label: "Secure Authentication",
    },
];

export default function AuthSidebar({ className }) {
    return (
        <aside
            aria-label="Branding Sidebar"
            className={cn(
                "auth-sidebar relative hidden overflow-hidden lg:flex flex-col justify-between",
                "bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-700",
                "p-10 xl:p-12 text-white select-none",
                className
            )}
        >
            {/* Background Ambient Glows */}
            <div className="pointer-events-none absolute -left-28 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -right-24 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" />

            {/* Top: Branding & Description */}
            <div className="relative z-10">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur-md shadow-sm">
                        <span className="text-xl font-bold tracking-tight text-white">M</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">
                        Media Manager
                    </h1>
                </div>

                <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-emerald-50/90 font-normal">
                    Buy, manage, and monitor media campaigns across Nigeria from one
                    secure platform.
                </p>
            </div>

            {/* Middle: Feature Highlights */}
            <div className="relative z-10 my-8 grid gap-4">
                {STATS_DATA.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <div
                            key={stat.label}
                            className="group flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 transition-all duration-300 hover:bg-white/15 hover:border-white/25 hover:shadow-lg"
                        >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-105">
                                <Icon className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <p className="text-xl font-bold tracking-tight leading-none text-white">
                                    {stat.value}
                                </p>
                                <p className="mt-1 text-xs font-medium text-emerald-100/90">
                                    {stat.label}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Bottom: Social Proof / Quote */}
            <div className="relative z-10 border-t border-white/10 pt-6">
                <p className="text-[14.5px] font-medium italic leading-relaxed text-emerald-50/85">
                    &ldquo;The smarter way to buy media in Nigeria.&rdquo;
                </p>
            </div>
        </aside>
    );
}