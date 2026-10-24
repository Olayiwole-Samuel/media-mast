"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import Container from "../common/Container";
import NigeriaStationMap from "../map/NigeriaStationMap";

export default function Hero() {
    const heroRef = useRef(null);
    const rightRef = useRef(null);
    const linesRef = useRef([]);
    const glowRef = useRef(null);

    // Dynamic mouse-follow via GSAP quickTo for zero-re-render 60fps performance
    useEffect(() => {
        if (!glowRef.current || !heroRef.current) return;

        const xTo = gsap.quickTo(glowRef.current, "left", {
            duration: 0.5,
            ease: "power3.out",
        });
        const yTo = gsap.quickTo(glowRef.current, "top", {
            duration: 0.5,
            ease: "power3.out",
        });

        const handleMouseMove = (e) => {
            const rect = heroRef.current.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            xTo(`${x}%`);
            yTo(`${y}%`);
        };

        const heroEl = heroRef.current;
        heroEl.addEventListener("mousemove", handleMouseMove);

        return () => {
            heroEl.removeEventListener("mousemove", handleMouseMove);
        };
    }, []);

    // Entry Sequence Timeline
    useEffect(() => {
        const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        if (prefersReducedMotion) return;

        const ctx = gsap.context(() => {
            const tl = gsap.timeline({
                defaults: { ease: "power4.out" },
            });

            // Signal-lock reveal for the headline lines
            tl.set(linesRef.current, { clipPath: "inset(0 100% 0 0)" })
                .from(".hero-eyebrow", { y: -12, opacity: 0, duration: 0.6 })
                .to(
                    linesRef.current,
                    {
                        clipPath: "inset(0 0% 0 0)",
                        duration: 1,
                        stagger: 0.12,
                    },
                    "-=0.2"
                )
                .from(
                    ".hero-desc, .hero-cta, .hero-status, .hero-stats > div",
                    {
                        y: 24,
                        opacity: 0,
                        duration: 0.7,
                        stagger: 0.08,
                        ease: "power3.out",
                    },
                    "-=0.55"
                )
                .from(
                    rightRef.current,
                    {
                        x: 60,
                        opacity: 0,
                        scale: 0.94,
                        duration: 1.1,
                        ease: "power3.out",
                    },
                    "-=0.9"
                );
        }, heroRef);

        return () => ctx.revert();
    }, []);

    return (
        <section
            ref={heroRef}
            id="home"
            className="relative min-h-screen overflow-hidden bg-[#05070c] pt-36 pb-12 select-none"
        >
            {/* Console grid texture */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(232,163,61,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(232,163,61,0.6) 1px, transparent 1px)",
                    backgroundSize: "64px 64px",
                    maskImage:
                        "radial-gradient(ellipse 80% 60% at 50% 20%, black 0%, transparent 75%)",
                    WebkitMaskImage:
                        "radial-gradient(ellipse 80% 60% at 50% 20%, black 0%, transparent 75%)",
                }}
            />

            {/* Mouse-follow signal glow */}
            <div
                ref={glowRef}
                className="pointer-events-none absolute h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/[0.07] blur-[140px] will-change-transform"
                style={{ left: "50%", top: "50%" }}
            />

            {/* Single controlled vignette */}
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute right-[-220px] top-[-160px] h-[600px] w-[600px] rounded-full bg-teal-500/[0.06] blur-[180px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#05070c_78%)]" />
            </div>

            <Container className="relative z-10">
                <div className="grid min-h-[85vh] items-center gap-x-16 gap-y-20 lg:grid-cols-2">
                    {/* Left Side */}
                    <div className="flex max-w-[680px] flex-col justify-center">
                        {/* Eyebrow */}
                        <div className="hero-eyebrow inline-flex w-fit items-center gap-3 rounded-full border border-amber-400/25 bg-amber-400/[0.08] py-2 pl-3 pr-5 backdrop-blur-xl">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                            </span>
                            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-amber-300">
                                Live Across Nigeria
                            </span>
                        </div>

                        {/* Heading */}
                        <h1 className="mt-8 max-w-[640px] font-display text-6xl font-black leading-[0.92] tracking-[-0.045em] text-white md:text-7xl xl:text-[92px]">
                            <span
                                ref={(el) => (linesRef.current[0] = el)}
                                className="block"
                            >
                                Plan.
                            </span>
                            <span
                                ref={(el) => (linesRef.current[1] = el)}
                                className="block"
                            >
                                Book.
                            </span>
                            <span
                                ref={(el) => (linesRef.current[2] = el)}
                                className="block bg-gradient-to-r from-amber-300 via-amber-400 to-teal-300 bg-clip-text text-transparent"
                            >
                                Broadcast.
                            </span>
                        </h1>

                        {/* Description */}
                        <p className="hero-desc mt-8 max-w-[540px] text-lg leading-8 text-slate-400 md:text-xl">
                            Discover media stations, compare advertising
                            opportunities, book campaigns in minutes, and
                            manage every broadcast from one intelligent
                            platform.
                        </p>

                        {/* CTA Buttons */}
                        <div className="hero-cta mt-10 flex flex-wrap items-center gap-5">
                            <button className="group relative inline-flex h-14 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-8 font-semibold text-[#05070c] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(232,163,61,.4)] active:scale-[0.98]">
                                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                                <span className="relative z-10 flex items-center">
                                    Start Booking
                                    <svg
                                        className="ml-3 transition-transform duration-300 group-hover:translate-x-1"
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="20"
                                        height="20"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M5 12h14M13 5l7 7-7 7"
                                        />
                                    </svg>
                                </span>
                            </button>

                            <button className="inline-flex h-14 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/5 px-8 font-medium text-white backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-teal-400/40 hover:bg-white/10 hover:shadow-[0_12px_35px_rgba(255,255,255,.08)] active:scale-[0.98]">
                                <svg
                                    className="mr-3"
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="18"
                                    height="18"
                                    fill="currentColor"
                                    viewBox="0 0 16 16"
                                >
                                    <path d="M11.596 8.697 6.233 11.98A.802.802 0 0 1 5 11.283V4.717a.802.802 0 0 1 1.233-.697l5.363 3.283a.802.802 0 0 1 0 1.394z" />
                                </svg>
                                Watch Demo
                            </button>
                        </div>

                        {/* Status Row */}
                        <div className="hero-status mt-8 flex flex-wrap items-center gap-6">
                            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-teal-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
                                All Systems Live
                            </div>
                            <div className="h-6 w-px bg-white/10" />
                            <p className="text-sm text-slate-400">
                                Trusted by agencies, brands and media buyers across{" "}
                                <span className="ml-1 font-semibold text-white">
                                    Nigeria
                                </span>
                            </p>
                        </div>

                        {/* Statistics */}
                        <div className="hero-stats mt-12 grid grid-cols-2 gap-y-8 border-t border-white/[0.08] pt-8 md:grid-cols-4">
                            {[
                                { value: "400+", label: "Verified Stations" },
                                { value: "₦2.5B+", label: "Budget Managed" },
                                { value: "99.9%", label: "Booking Accuracy" },
                                { value: "36", label: "States Covered" },
                            ].map((stat) => (
                                <div key={stat.label}>
                                    <h2 className="font-mono text-3xl font-bold tabular-nums tracking-tight text-white md:text-4xl">
                                        {stat.value}
                                    </h2>
                                    <p className="mt-2 text-sm leading-6 text-slate-500">
                                        {stat.label}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Side */}
                    <div
                        ref={rightRef}
                        className="relative flex items-center justify-end"
                    >
                        <div className="absolute h-[600px] w-[600px] rounded-full bg-amber-400/[0.05] blur-[120px]" />

                        <div className="relative h-[700px] w-full max-w-[700px]">
                            <div className="absolute inset-0 rounded-[40px] border border-white/10 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-sm" />

                            <div className="absolute inset-0 overflow-hidden rounded-[40px]">
                                <NigeriaStationMap />
                            </div>

                        </div>
                    </div>
                </div>
            </Container>
        </section>
    );
}