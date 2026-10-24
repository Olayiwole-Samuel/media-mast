"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

import AuthSidebar from "./AuthSidebar";
import useAuthAnimation from "./hooks/useAuthAnimation";

export default function AuthLayout({ children, className }) {
    const layoutRef = useRef(null);

    useAuthAnimation(layoutRef);

    return (
        <main
            ref={layoutRef}
            className={cn("min-h-[100dvh] bg-slate-50 text-slate-900 antialiased", className)}
        >
            <div className="grid min-h-[100dvh] lg:grid-cols-[42%_58%]">
                {/* Left Branding Panel */}
                <AuthSidebar />

                {/* Right Form Area */}
                <section
                    aria-label="Authentication Form Area"
                    className="relative flex flex-col justify-center items-center px-5 py-12 sm:px-8 lg:px-12 xl:px-16"
                >
                    {/* Navigation Back Button */}
                    <div className="absolute left-5 top-6 sm:left-8 sm:top-8 z-10">
                        <Link
                            href="/"
                            className="
                group inline-flex items-center gap-2
                rounded-full border border-slate-200 bg-white/90 backdrop-blur-sm
                px-4 py-2.5 text-sm font-medium text-slate-600
                shadow-sm transition-all duration-200
                hover:border-emerald-300 hover:text-emerald-600 hover:shadow-md
                focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30
                active:scale-[0.98]
              "
                        >
                            <ArrowLeft
                                size={16}
                                className="transition-transform duration-200 group-hover:-translate-x-1 text-slate-500 group-hover:text-emerald-600"
                            />
                            <span>Back to Home</span>
                        </Link>
                    </div>

                    {/* Form Container with Mobile Margin Offset */}
                    <div className="w-full max-w-[420px] mt-14 sm:mt-12 lg:mt-0">
                        {children}
                    </div>
                </section>
            </div>
        </main>
    );
}