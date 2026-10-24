"use client";

export default function Aurora() {

    return (

        <div className="absolute inset-0 overflow-hidden pointer-events-none">

            {/* Aurora 1 */}

            <div
                className="
                    aurora-one
                    absolute
                    left-[-15%]
                    top-[5%]
                    h-[520px]
                    w-[520px]
                    rounded-full
                    bg-emerald-500/18
                    blur-[140px]
                "
            />

            {/* Aurora 2 */}

            <div
                className="
                    aurora-two
                    absolute
                    right-[-12%]
                    bottom-[5%]
                    h-[460px]
                    w-[460px]
                    rounded-full
                    bg-cyan-400/12
                    blur-[140px]
                "
            />

            {/* Aurora 3 */}

            <div
                className="
                    aurora-three
                    absolute
                    left-[35%]
                    top-[45%]
                    h-[320px]
                    w-[320px]
                    rounded-full
                    bg-emerald-300/10
                    blur-[120px]
                "
            />

        </div>

    );

}