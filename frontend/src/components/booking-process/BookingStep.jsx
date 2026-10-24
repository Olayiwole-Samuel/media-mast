"use client";

export default function BookingStep({
    number,
    title,
    description,
    icon,
}) {
    return (
        <div
            className="
                booking-step group relative z-20 flex w-full max-w-[280px] flex-col items-center text-center
                rounded-3xl border border-slate-100 bg-white/80 p-6 backdrop-blur-sm
                shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-all duration-500 hover:-translate-y-2
                hover:border-emerald-200 hover:shadow-[0_20px_40px_rgba(16,185,129,0.08)]
            "
        >
            {/* Number Pill / Circle */}
            <div
                className="
                    step-circle relative flex h-16 w-16 items-center justify-center rounded-2xl
                    border border-slate-200/80 bg-slate-50 text-xl font-black text-slate-800
                    shadow-inner transition-all duration-500
                    group-hover:rotate-6 group-hover:scale-110 group-hover:border-emerald-500
                    group-hover:bg-emerald-500 group-hover:text-white group-hover:shadow-[0_10px_25px_rgba(16,185,129,0.3)]
                "
            >
                <span>{number}</span>
            </div>

            {/* Icon Badge */}
            <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-all duration-500 group-hover:scale-110 group-hover:bg-emerald-100 group-hover:text-emerald-700">
                {icon}
            </div>

            {/* Title */}
            <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-900 transition-colors duration-300 group-hover:text-emerald-950">
                {title}
            </h3>

            {/* Description */}
            <p className="mt-2 text-sm leading-relaxed text-slate-600 font-normal">
                {description}
            </p>
        </div>
    );
}