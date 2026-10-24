"use client";

import MediaHeader from "./MediaHeader";
import NigeriaMap from "./NigeriaMap";
import StatsGrid from "./StatsGrid";
import Stars from "./Stars";
import useAuroraAnimation from "./hooks/useAuroraAnimation";
import Aurora from "./Aurora";

export default function MediaCoverage() {

    useAuroraAnimation();
    return (

        <section
        id="explore"
            className="
    relative
    overflow-hidden
    bg-gradient-to-b
    from-[#020617]
    via-[#07111f]
    to-[#020617]
    py-32
"
        >
            <Stars />

            <Aurora />

            <div
                className="
                    mx-auto
                    max-w-7xl
                    px-6
                    lg:px-10
                "
            >

                <MediaHeader />

                <div
                    className="
                        mt-24
                        grid
                        items-center
                        gap-20
                        lg:grid-cols-[1.5fr_0.9fr]
                    "
                >

                    {/* Map */}

                    <NigeriaMap />

                    {/* Stats */}

                    <StatsGrid />

                </div>

            </div>

        </section>

    );

}