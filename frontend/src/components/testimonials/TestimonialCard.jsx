"use client";

import { Quote, Star } from "lucide-react";

export default function TestimonialCard({ testimonial }) {

    return (

        <div
            className="
                group
                relative
                flex
                h-full
                flex-col
                overflow-hidden
                rounded-3xl
                border
                border-white/10
                bg-white/5
                p-8
                backdrop-blur-xl
                transition-all
                duration-500
                hover:-translate-y-3
                hover:border-emerald-400/40
                hover:bg-white/10
                hover:shadow-[0_20px_80px_rgba(16,185,129,0.18)]
            "
        >

            {/* Glow */}

            <div
                className="
                    absolute
                    -right-24
                    -top-24
                    h-56
                    w-56
                    rounded-full
                    bg-emerald-500/10
                    blur-3xl
                    opacity-0
                    transition-opacity
                    duration-500
                    group-hover:opacity-100
                "
            />

            {/* Quote Icon */}

            <Quote
                className="
                    mb-6
                    h-10
                    w-10
                    text-emerald-400
                "
            />

            {/* Quote */}

            <p
                className="
                    text-lg
                    leading-8
                    text-slate-300
                "
            >
                &ldquo;{testimonial.quote}&rdquo;
            </p>

            {/* Rating */}

            <div className="mt-8 flex gap-1">

                {Array.from({ length: testimonial.rating }).map((_, index) => (

                    <Star
                        key={index}
                        className="
                            h-5
                            w-5
                            fill-yellow-400
                            text-yellow-400
                        "
                    />

                ))}

            </div>

            {/* User */}

            <div className="mt-auto flex items-center gap-4 pt-8">

                <div
                    className="
                        flex
                        h-14
                        w-14
                        items-center
                        justify-center
                        rounded-full
                        bg-emerald-500
                        text-lg
                        font-bold
                        text-white
                        shadow-[0_0_20px_rgba(16,185,129,0.45)]
                    "
                >
                    {testimonial.initials}
                </div>

                <div>

                    <h3
                        className="
                            text-lg
                            font-bold
                            text-white
                        "
                    >
                        {testimonial.name}
                    </h3>

                    <p className="text-sm text-slate-400">
                        {testimonial.role}
                    </p>

                    <p className="text-sm text-emerald-400">
                        {testimonial.company}
                    </p>

                </div>

            </div>

        </div>

    );

}