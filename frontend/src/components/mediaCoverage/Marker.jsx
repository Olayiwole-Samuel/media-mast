"use client";

export default function Marker({
    location,
    active,
    onHover,
    onLeave,
}) {

    return (

        <div
            className={`
                absolute
                ${active ? "z-[9999]" : "z-20"}
            `}
            style={{
                left: location.x,
                top: location.y,
                transform: "translate(-50%, -50%)",
            }}
        >

            {/* Glow */}

            <div
                className="
                    absolute
                    left-1/2
                    top-1/2
                    h-10
                    w-10
                    -translate-x-1/2
                    -translate-y-1/2
                    rounded-full
                    bg-emerald-400/20
                    blur-md
                    pointer-events-none
                    marker-glow
                "
            />

            {/* Marker */}

            <button

                onMouseEnter={() => onHover(location.id)}

                onMouseLeave={onLeave}

                className="
                    marker-dot
                    relative
                    z-10
                    flex
                    h-5
                    w-5
                    items-center
                    justify-center
                    rounded-full
                    border-2
                    border-white
                    bg-emerald-500
                    shadow-[0_0_18px_rgba(16,185,129,0.9)]
                    transition-all
                    duration-300
                    hover:scale-150
                    hover:shadow-[0_0_28px_rgba(16,185,129,1)]
                "

            >

                <span
                    className="
                        h-2
                        w-2
                        rounded-full
                        bg-white
                    "
                />

            </button>

            {/* Tooltip */}

            {active && (

                <div
                    className="
                        marker-tooltip
                        absolute
                        bottom-12
                        left-1/2
                        z-50
                        w-64
                        -translate-x-1/2
                        rounded-3xl
                        border
                        border-emerald-500/20
                        bg-slate-900/95
                        p-5
                        shadow-[0_20px_60px_rgba(16,185,129,0.15)]
                        backdrop-blur-xl
                    "
                >

                    {/* Connector */}

                    <div
                        className="
                            absolute
                            left-1/2
                            bottom-[-34px]
                            h-8
                            w-[2px]
                            -translate-x-1/2
                            bg-gradient-to-b
                            from-emerald-400
                            to-transparent
                        "
                    />

                    <h3
                        className="
                            text-lg
                            font-bold
                            text-white
                        "
                    >
                        {location.name}
                    </h3>

                    <p
                        className="
                            mt-2
                            text-sm
                            text-slate-400
                        "
                    >
                        {location.stations} Media Stations
                    </p>

                    <div
                        className="
                            mt-4
                            rounded-xl
                            bg-emerald-500/10
                            p-3
                            text-sm
                            font-medium
                            text-emerald-300
                        "
                    >
                        {location.coverage}
                    </div>

                </div>

            )}

        </div>

    );

}