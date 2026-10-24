"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import Container from "../common/Container";
import MediaCategoryCard from "../common/MediaCategoryCard";
import LogoMarquee from "../common/LogoMarquee";

import { Radio, MonitorPlay, Megaphone } from "lucide-react";
import FadeUp from "../animations/FadeUp";

gsap.registerPlugin(ScrollTrigger);

const MEDIA_CATEGORIES = [
    {
        id: "radio",
        title: "Radio",
        icon: <Radio className="h-7 w-7 text-emerald-400" />,
        stations: ["Cool FM", "Beat FM", "Wazobia FM", "Classic FM"],
        delay: 0.1,
    },
    {
        id: "tv",
        title: "Television",
        icon: <MonitorPlay className="h-7 w-7 text-emerald-400" />,
        stations: ["Channels TV", "AIT", "TVC", "Silverbird TV"],
        delay: 0.2,
    },
    {
        id: "outdoor",
        title: "Outdoor",
        icon: <Megaphone className="h-7 w-7 text-emerald-400" />,
        stations: [
            "Billboards",
            "Transit Ads",
            "Airport Displays",
            "Digital Screens",
        ],
        delay: 0.3,
    },
];

export default function TrustedBy() {
    const sectionRef = useRef(null);

    return (
        <section
            ref={sectionRef}
            className="relative overflow-hidden bg-[#081523] py-28"
        >
            {/* Background Effects */}
            <div className="pointer-events-none absolute inset-0 select-none">
                <div className="absolute -top-40 left-1/2 h-[450px] w-[450px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[140px]" />
                <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#020617] to-transparent" />
            </div>

            <Container className="relative z-10">
                {/* Header Section */}
                <FadeUp>
                    <div className="mx-auto max-w-3xl text-center">
                        {/* Small Pill Label */}
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-1.5 backdrop-blur-md">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                                Media Network
                            </span>
                        </div>

                        {/* Heading */}
                        <h2 className="mt-6 font-display text-4xl font-black tracking-tight text-white md:text-5xl lg:text-6xl">
                            Access Nigeria’s Leading{" "}
                            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                                Media Networks
                            </span>
                        </h2>

                        {/* Description */}
                        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
                            Explore advertising opportunities across radio,
                            television, outdoor, and digital media through one
                            unified booking experience.
                        </p>
                    </div>
                </FadeUp>

                {/* Grid Category Cards */}
                <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                    {MEDIA_CATEGORIES.map((cat) => (
                        <FadeUp key={cat.id} delay={cat.delay}>
                            <MediaCategoryCard
                                icon={cat.icon}
                                title={cat.title}
                                stations={cat.stations}
                            />
                        </FadeUp>
                    ))}
                </div>

                {/* Full-width Logo Marquee */}
                <div className="mt-20">
                    <FadeUp delay={0.4}>
                        <LogoMarquee />
                    </FadeUp>
                </div>
            </Container>
        </section>
    );
}