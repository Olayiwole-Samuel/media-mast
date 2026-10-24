"use client";

import { useRef } from "react";

import FeaturesHeader from "./FeaturesHeader";
import FeaturesGrid from "./FeaturesGrid";

import useFeaturesAnimation from "./hooks/useFeaturesAnimation";

export default function CampaignFeatures() {
    const sectionRef = useRef(null);

    useFeaturesAnimation(sectionRef);

    return (
        <section
            ref={sectionRef}
            id="features"
            className="
                relative overflow-hidden
                bg-white px-6 py-28 sm:py-36
                lg:px-12 xl:px-20
            "
        >
            {/* Background Glows */}
            <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[600px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[160px]" />
            <div className="pointer-events-none absolute -right-20 top-1/3 -z-10 h-[400px] w-[400px] rounded-full bg-teal-400/10 blur-[140px]" />

            {/* Layout Container */}
            <div className="relative z-10 mx-auto max-w-7xl">
                <FeaturesHeader />
                <FeaturesGrid />
            </div>
        </section>
    );
}