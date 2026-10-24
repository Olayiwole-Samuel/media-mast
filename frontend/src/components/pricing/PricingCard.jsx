"use client";

import Link from "next/link";
import { Check } from "lucide-react";

export default function PricingCard({
    name,
    description,
    monthlyPrice,
    annualPrice,
    features,
    buttonText,
    href = "/login",
    popular,
    isAnnual,
}) {

    const price = isAnnual ? annualPrice : monthlyPrice;

    return (

        <div
            className={`
                pricing-card
                relative
                overflow-hidden
                rounded-[36px]
                border
                p-8
                transition-all
                duration-500
                ${popular
                    ? "border-emerald-500 shadow-[0_30px_90px_rgba(16,185,129,.18)] scale-[1.03]"
                    : "border-slate-200 shadow-[0_20px_70px_rgba(15,23,42,.06)]"
                }
                hover:-translate-y-3
            `}
        >


            {/* Cursor Glow */}

            <div
                className="
        pricing-glow
        absolute
        left-1/2
        top-1/2
        h-52
        w-52
        -translate-x-1/2
        -translate-y-1/2
        rounded-full
        bg-emerald-400/15
        blur-[70px]
        opacity-0
        transition-opacity
        duration-300
        pointer-events-none
    "
            />

            {/* Popular Badge */}

            {popular && (

                <div
                    className="
                        absolute
                        right-6
                        top-6
                        rounded-full
                        bg-emerald-500
                        px-4
                        py-2
                        text-xs
                        font-bold
                        uppercase
                        tracking-widest
                        text-white
                    "
                >
                    Most Popular
                </div>

            )}

            {/* Plan */}

            <h3
                className="
                    text-3xl
                    font-black
                    text-slate-900
                "
            >
                {name}
            </h3>

            {/* Description */}

            <p
                className="
                    mt-4
                    text-base
                    leading-8
                    text-slate-600
                "
            >
                {description}
            </p>

            {/* Price */}

            <div className="mt-10">

                <h2
                    key={price}
                    className="
            pricing-price
            text-5xl
            font-black
            text-slate-900
            animate-price
        "
                >
                    {price}
                </h2>

                <p
                    key={isAnnual ? "year" : "month"}
                    className="
            mt-2
            text-slate-500
            animate-price
        "
                >
                    {price === "Custom"
                        ? ""
                        : isAnnual
                            ? "/year"
                            : "/month"}
                </p>

            </div>

            {/* Divider */}

            <div className="my-10 h-px bg-slate-200" />

            {/* Features */}

            <div className="space-y-5">

                {features.map((feature) => (

                    <div
                        key={feature}
                        className="
                            flex
                            items-center
                            gap-4
                        "
                    >

                        <div
                            className="
                                flex
                                h-8
                                w-8
                                items-center
                                justify-center
                                rounded-full
                                bg-emerald-100
                            "
                        >
                            <Check
                                size={16}
                                className="text-emerald-600"
                            />
                        </div>

                        <span
                            className="
                                text-slate-700
                            "
                        >
                            {feature}
                        </span>

                    </div>

                ))}

            </div>

            {/* Button */}

            <Link
                href={href}
                className={`
    block
    text-center
    mt-12
    w-full
    rounded-2xl
    py-4
    text-lg
    font-semibold
    transition-all
    duration-300
    ${popular
                        ? "bg-gradient-to-r from-emerald-500 to-green-400 text-white shadow-lg hover:scale-105"
                        : "bg-slate-900 text-white hover:bg-emerald-500 hover:scale-105"
                    }
`}
            >
                {buttonText}
            </Link>

        </div>

    );

}