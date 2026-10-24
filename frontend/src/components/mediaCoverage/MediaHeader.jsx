"use client";

export default function MediaHeader() {

    return (

        <div
            className="
                mx-auto
                max-w-4xl
                text-center
            "
        >

            {/* Badge */}

            <span
                className="
                    media-badge
                    inline-flex
                    items-center
                    rounded-full
                    border
                    border-emerald-500/30
                    text-emerald-400
                    bg-emerald-500/10
                    px-5
                    py-2
                    text-xs
                    font-semibold
                    uppercase
                    tracking-[0.35em]
                "
            >
                Nationwide Coverage
            </span>

            {/* Heading */}

            <h2
                className="
                    media-heading
                    mt-8
                    text-5xl
                    font-black
                    leading-tight
                    text-white
                    sm:text-6xl
                "
            >
                Reach Every Corner
                <br />
                Of Nigeria
            </h2>

            {/* Description */}

            <p
                className="
                    media-description
                    mx-auto
                    mt-8
                    max-w-3xl
                    text-lg
                    leading-9
                    text-slate-400
                "
            >
                Discover verified TV, Radio, Outdoor and Digital advertising
                opportunities across Nigeria. From Lagos to Maiduguri, your
                campaigns reach the right audience through trusted media
                partners.
            </p>

        </div>

    );

}