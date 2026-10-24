"use client";

import { useRef, useState } from "react";


import PricingToggle from "./PricingToggle";
import PricingGrid from "./PricingGrid";
import usePricingCardEffects from "./hooks/usePricingCardEffects";

export default function Pricing() {

    const sectionRef = useRef(null);

    const [isAnnual, setIsAnnual] = useState(false);

    usePricingCardEffects();

    return (

        <section
            id="pricing"
            ref={sectionRef}
            className="
                relative
                overflow-hidden
                bg-white
                px-6
                py-32
                lg:px-12
                xl:px-20
            "
        >

            {/* Background Glow */}

            <div
                className="
                    absolute
                    left-1/2
                    top-0
                    h-[700px]
                    w-[700px]
                    -translate-x-1/2
                    rounded-full
                    bg-emerald-400/10
                    blur-[180px]
                "
            />

            <div className="relative mx-auto max-w-7xl">

                {/* Badge */}

                <span
                    className="
                        pricing-badge
                        mx-auto
                        flex
                        w-fit
                        rounded-full
                        border
                        border-emerald-200
                        bg-emerald-50
                        px-5
                        py-2
                        text-xs
                        font-semibold
                        uppercase
                        tracking-[0.35em]
                        text-emerald-600
                    "
                >
                    Pricing
                </span>

                {/* Heading */}

                <h2
                    className="
                        pricing-heading
                        mt-8
                        text-center
                        text-5xl
                        font-black
                        leading-tight
                        text-slate-900
                        sm:text-6xl
                    "
                >
                    Simple, Transparent
                    <br />
                    Pricing
                </h2>

                {/* Description */}

                <p
                    className="
                        pricing-description
                        mx-auto
                        mt-8
                        max-w-3xl
                        text-center
                        text-lg
                        leading-9
                        text-slate-600
                    "
                >
                    Flexible plans designed for businesses of every size.
                    Switch between monthly and annual billing anytime.
                </p>

                <PricingToggle
                    isAnnual={isAnnual}
                    setIsAnnual={setIsAnnual}
                />

                <PricingGrid
                    isAnnual={isAnnual}
                />

            </div>

        </section>

    );

}