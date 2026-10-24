"use client";

import { useRef } from "react";
import useCountUp from "./hooks/useCountUp";

export default function StatCard({ value, suffix, label }) {

    const numberRef = useRef(null);

    useCountUp(numberRef, value);

    return (

        <div
            className="
                media-stat
                rounded-3xl
                border
                border-slate-700
                bg-slate-900/70
                p-8
                shadow-sm
                backdrop-blur-xl
                transition-all
                duration-300
                hover:-translate-y-2
                hover:border-emerald-400
                hover:shadow-xl
            "
        >

            <h3
                className="
                    text-5xl
                    font-black
                    text-emerald-400
                "
            >

                <span ref={numberRef}>
                    0
                </span>

                {suffix}

            </h3>

            <p
                className="
                    mt-4
                    text-lg
                    font-medium
                    text-slate-300
                "
            >
                {label}
            </p>

        </div>

    );

}