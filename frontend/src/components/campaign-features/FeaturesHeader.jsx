"use client";

export default function FeaturesHeader() {
    return (
        <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <div className="features-badge inline-block">
                <span
                    className="
                        inline-flex items-center gap-2 rounded-full
                        border border-emerald-500/20 bg-emerald-50/80 px-4 py-1.5
                        text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700
                        shadow-[0_2px_10px_rgba(16,185,129,0.08)] backdrop-blur-md
                    "
                >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    FEATURES
                </span>
            </div>

            {/* Heading */}
            <h2
                className="
                    features-heading mt-6 text-4xl font-extrabold tracking-tight
                    text-slate-900 sm:text-5xl lg:text-6xl lg:leading-[1.12]
                "
            >
                Everything You Need <br className="hidden sm:inline" />
                to Run <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">Successful Campaigns</span>
            </h2>

            {/* Description */}
            <p
                className="
                    features-description mx-auto mt-6 max-w-2xl
                    text-base leading-relaxed text-slate-600 sm:text-lg sm:leading-8
                "
            >
                Manage your entire advertising workflow from one powerful platform.
                Search media, schedule campaigns, upload creatives, make secure payments,
                monitor performance, and receive instant updates—all in one place.
            </p>
        </div>
    );
}