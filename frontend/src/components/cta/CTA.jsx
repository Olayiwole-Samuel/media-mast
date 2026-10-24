"use client";

import { useRef } from "react";

import useCTAAnimation from "./hooks/useCTAAnimation";

export default function CTA() {

    const sectionRef = useRef(null);

    useCTAAnimation(sectionRef);

    return (

        <section
            ref={sectionRef}
            id="contact"
            className="
                relative
                overflow-hidden
                bg-white
                py-32
            "
        >

            {/* Background Glow */}

            <div
                className="
        absolute
        left-1/2
        top-1/2
        h-[520px]
        w-[520px]
        -translate-x-1/2
        -translate-y-1/2
        rounded-full
        bg-gradient-to-r
        from-emerald-400/20
        via-emerald-300/10
        to-transparent
        blur-[150px]
        animate-pulse
    "
            />

            {/* Decorative Circle */}

            <div
                className="
                    absolute
                    -left-24
                    top-20
                    h-72
                    w-72
                    rounded-full
                    bg-emerald-100
                    blur-3xl
                    opacity-60
                "
            />

            <div
                className="
                    absolute
                    -right-24
                    bottom-20
                    h-72
                    w-72
                    rounded-full
                    bg-emerald-100
                    blur-3xl
                    opacity-60
                "
            />

            <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">

                <p
                    className="
                        cta-badge
                        text-sm
                        font-semibold
                        uppercase
                        tracking-[0.35em]
                        text-emerald-500
                    "
                >
                    Get Started Today
                </p>

                <h2
                    className="
                        cta-title
                        mt-6
                        text-5xl
                        font-black
                        leading-tight
                        text-slate-900
                        md:text-7xl
                    "
                >
                    Ready to Transform
                    <span className="block text-emerald-500">
                        Your Media Buying?
                    </span>
                </h2>

                <p
                    className="
                        cta-text
                        mx-auto
                        mt-8
                        max-w-2xl
                        text-xl
                        leading-9
                        text-slate-600
                    "
                >
                    Join 500+ agencies already using Media Manager
                    to plan smarter, book faster, and manage
                    campaigns across Nigeria.
                </p>

                {/* Buttons */}

                <div
                    className="
                        cta-buttons
                        mt-14
                        flex
                        flex-col
                        items-center
                        justify-center
                        gap-5
                        sm:flex-row
                    "
                >

                    <button
                        className="
                            rounded-2xl
                            bg-emerald-500
                            px-8
                            py-4
                            text-lg
                            font-semibold
                            text-white
                            transition-all
                            duration-300
                            hover:-translate-y-1
                            hover:bg-emerald-600
                            hover:shadow-[0_20px_50px_rgba(16,185,129,0.35)]
                        "
                    >
                        Start Free Trial
                    </button>

                    <button
                        className="
group
rounded-2xl
border
border-slate-300
bg-white
px-8
py-4
text-lg
font-semibold
text-slate-900
transition-all
duration-300
hover:-translate-y-1
hover:scale-105
hover:border-emerald-500
hover:text-emerald-500
hover:shadow-xl
active:scale-95
"
                    >
                        Schedule Demo
                    </button>

                </div>

            </div>

        </section>

    );

}