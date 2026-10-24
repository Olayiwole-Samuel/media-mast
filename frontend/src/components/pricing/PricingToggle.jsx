"use client";

export default function PricingToggle({
    isAnnual,
    setIsAnnual,
}) {
    return (
        <div
            className="
        pricing-toggle
        mt-14
        flex
        justify-center
    "
        >

            <div
                className="
                    relative
                    flex
                    h-16
                    w-[320px]
                    items-center
                    rounded-full
                    border
                    border-slate-200
                    bg-slate-100
                    p-2
                "
            >

                {/* Sliding Background */}

                <div
                    className={`
                        absolute
                        top-2
                        h-12
                        w-[148px]
                        rounded-full
                        bg-gradient-to-r
                        from-emerald-500
                        to-green-400
                        shadow-lg
                        transition-all
                        duration-300
                        ${isAnnual ? "translate-x-[156px]" : "translate-x-0"}
                    `}
                />

                {/* Monthly */}

                <button
                    onClick={() => setIsAnnual(false)}
                    className={`
                        relative
                        z-10
                        flex-1
                        rounded-full
                        text-base
                        font-semibold
                        transition-all
                        duration-300
                        ${!isAnnual
                            ? "text-white"
                            : "text-slate-700"
                        }
                    `}
                >
                    Monthly
                </button>

                {/* Annual */}

                <div className="relative flex-1">

                    <button
                        onClick={() => setIsAnnual(true)}
                        className={`
            relative
            z-10
            w-full
            rounded-full
            text-base
            font-semibold
            transition-all
            duration-300
            ${isAnnual
                                ? "text-white"
                                : "text-slate-700"
                            }
        `}
                    >
                        Annual
                    </button>

                    {/* Save Badge */}

                    <div
                        className={`
            absolute
            -right-4
            -top-7
            rounded-full
            bg-gradient-to-r
            from-emerald-500
            to-green-400
            px-3
            py-1
            text-[10px]
            font-bold
            uppercase
            tracking-wider
            text-white
            shadow-lg
            transition-all
            duration-300
            ${isAnnual
                                ? "scale-100 opacity-100"
                                : "scale-0 opacity-0"
                            }
        `}
                    >
                        Save 20%
                    </div>

                </div>

            </div>

        </div>
    );
}