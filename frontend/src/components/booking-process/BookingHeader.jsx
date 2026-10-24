"use client";

import { Sparkles } from "lucide-react";

export default function BookingHeader() {
    return (
        <div className="relative mx-auto max-w-4xl text-center">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-5 py-2 backdrop-blur-sm transition-colors duration-300 hover:border-emerald-300 hover:bg-emerald-100/70">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-700">
                    How It Works
                </span>
            </div>

            {/* Gradient Heading */}
            <h2 className="booking-heading mt-8 text-4xl font-black tracking-tight text-slate-900 sm:text-6xl lg:text-7xl leading-[1.1]">
                Book Your Ad <br />
                <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                    in 4 Simple Steps
                </span>
            </h2>

            {/* Description */}
            <p className="booking-description mx-auto mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-slate-600 font-normal">
                From discovering top-tier media stations to tracking real-time
                campaign performance, Media Manager makes advertising crisp,
                transparent, and effortlessly seamless.
            </p>
        </div>
    );
}