"use client";

import { useRef } from "react";

import testimonials from "./data/testimonials";
import TestimonialCard from "./TestimonialCard";
import useTestimonialsAnimation from "./hooks/useTestimonialsAnimation";

export default function Testimonials() {

    const sectionRef = useRef(null);

    useTestimonialsAnimation(sectionRef);

    return (

        <section
            id="testimonials"
            ref={sectionRef}
            className="
                relative
                overflow-hidden
                bg-[#030712]
                py-28
            "
        >

            {/* Background Glow */}

            <div
                className="
                    absolute
                    left-1/2
                    top-0
                    h-[450px]
                    w-[450px]
                    -translate-x-1/2
                    rounded-full
                    bg-emerald-500/10
                    blur-[120px]
                "
            />

            <div className="relative z-10 mx-auto max-w-7xl px-6">

                {/* Heading */}

                <div className="testimonial-heading mx-auto max-w-3xl text-center">

                    <p
                        className="
                            text-sm
                            font-semibold
                            uppercase
                            tracking-[0.35em]
                            text-emerald-400
                        "
                    >
                        Testimonials
                    </p>

                    <h2
                        className="
                            mt-6
                            text-4xl
                            font-black
                            text-white
                            md:text-6xl
                        "
                    >
                        Trusted by Nigerias

                        <span className="block text-emerald-400">
                            Top Agencies
                        </span>

                    </h2>

                    <p
                        className="
                            mx-auto
                            mt-6
                            max-w-2xl
                            text-lg
                            leading-8
                            text-slate-400
                        "
                    >
                        Powering campaigns for agencies, brands, and media
                        buyers across Nigeria.
                    </p>

                </div>

                {/* Carousel */}

                <div className="relative mt-20 overflow-hidden">

                    <div
                        className="
                            testimonial-track
                            flex
                            w-max
                            gap-8
                        "
                    >

                        {[...testimonials, ...testimonials].map((testimonial, index) => (

                            <div
                                key={`${testimonial.id}-${index}`}
                                className="
                                    testimonial-card
                                    w-[380px]
                                    shrink-0
                                "
                            >

                                <TestimonialCard
                                    testimonial={testimonial}
                                />

                            </div>

                        ))}

                    </div>

                </div>

            </div>

        </section>

    );

}