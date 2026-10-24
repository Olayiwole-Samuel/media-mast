"use client";

export default function FeatureCard({
    icon: Icon,
    title,
    description,
}) {
    return (
        <div
            className="
                feature-card group relative overflow-hidden rounded-[32px]
                border border-slate-200/80 bg-white/90 p-8 backdrop-blur-sm
                shadow-[0_4px_25px_rgba(15,23,42,0.03)] transition-all duration-500
                hover:-translate-y-2 hover:border-emerald-300 hover:bg-white
                hover:shadow-[0_20px_50px_rgba(16,185,129,0.12)]
            "
        >
            {/* Background Corner Glow */}
            <div
                className="
                    pointer-events-none absolute -right-16 -top-16 h-44 w-44
                    rounded-full bg-emerald-400/10 blur-3xl transition-all duration-500
                    group-hover:scale-125 group-hover:bg-emerald-400/20
                "
            />

            {/* Icon Wrapper — .feature-icon is targeted by GSAP hook */}
            <div
                className="
                    feature-icon relative flex h-16 w-16 items-center justify-center
                    rounded-2xl border border-emerald-100 bg-emerald-50/80 text-emerald-600
                    shadow-sm transition-all duration-500
                    group-hover:rotate-6 group-hover:scale-110 group-hover:border-emerald-200 group-hover:bg-emerald-500 group-hover:text-white
                    group-hover:shadow-[0_8px_20px_rgba(16,185,129,0.3)]
                "
            >
                {Icon && <Icon className="h-7 w-7 stroke-[2.2]" />}
            </div>

            {/* Title */}
            <h3 className="mt-8 text-2xl font-bold tracking-tight text-slate-900 transition-colors duration-300 group-hover:text-emerald-950">
                {title}
            </h3>

            {/* Description */}
            <p className="mt-4 text-base leading-relaxed text-slate-600">
                {description}
            </p>
        </div>
    );
}