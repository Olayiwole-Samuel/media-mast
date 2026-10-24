"use client";

const LOGOS = [
    "Channels TV",
    "Cool FM",
    "Beat FM",
    "AIT",
    "Silverbird",
    "TVC",
    "Wazobia FM",
    "RayPower",
];

export default function LogoMarquee() {
    return (
        <div className="group relative w-full overflow-hidden py-4">
            {/* Left Edge Fade Mask */}
            <div className="pointer-events-none absolute left-0 top-0 z-20 h-full w-24 bg-gradient-to-r from-[#081523] to-transparent md:w-36" />

            {/* Right Edge Fade Mask */}
            <div className="pointer-events-none absolute right-0 top-0 z-20 h-full w-24 bg-gradient-to-l from-[#081523] to-transparent md:w-36" />

            {/* Continuous Scrolling Track */}
            <div className="flex w-max animate-marquee gap-12 group-hover:[animation-play-state:paused] md:gap-20">
                {[...LOGOS, ...LOGOS, ...LOGOS].map((logo, index) => (
                    <div
                        key={index}
                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-6 py-3.5 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/30 hover:bg-white/[0.05] hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                    >
                        {/* Live Signal Pulse Pill */}
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                        
                        <span className="text-sm font-semibold tracking-wider text-slate-400 transition-colors duration-300 hover:text-white md:text-base">
                            {logo}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}