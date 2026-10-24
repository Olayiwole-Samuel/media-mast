"use client";

import { useState } from "react";
import Image from "next/image";

import Marker from "./Marker";
import { locations } from "./data/locations";

export default function NigeriaMap() {

    const [activeMarker, setActiveMarker] = useState(null);

    return (

        <div
            className="
                relative
                mx-auto
                w-full
                max-w-3xl
            "
        >

            {/* Emerald Glow */}

            <div
                className="
                    absolute
                    left-1/2
                    top-1/2
                    h-[500px]
                    w-[500px]
                    -translate-x-1/2
                    -translate-y-1/2
                    rounded-full
                    bg-emerald-500/30
                    blur-[120px]
                "
            />

            {/* Map */}

            <div
                className="
                    relative
                    map-container
                "
            >

                <Image
                    src="/maps/nigeria.svg"
                    alt="Nigeria Map"
                    width={900}
                    height={900}
                    priority
                    className="
                        relative
                        z-0
                        w-full
                        select-none
                        drop-shadow-2xl
                    "
                />

                {locations.map((location) => (

                    <Marker
                        key={location.id}
                        location={location}
                        active={activeMarker === location.id}
                        onHover={setActiveMarker}
                        onLeave={() => setActiveMarker(null)}
                    />

                ))}

            </div>

        </div>

    );

}