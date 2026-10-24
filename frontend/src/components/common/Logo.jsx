import Link from "next/link";
import { cn } from "@/lib/utils";

export default function Logo({ className }) {
    return (
        <Link
            href="/"
            className={cn(
                "group inline-flex items-center gap-3 select-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded-xl",
                className
            )}
        >
            {/* Logo Icon Badge */}
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-cyan-500 shadow-[0_8px_25px_rgba(16,185,129,0.3)] transition-all duration-300 ease-out group-hover:scale-105 group-hover:shadow-[0_12px_30px_rgba(16,185,129,0.45)]">
                {/* Subtle Glass Highlight */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/20 via-transparent to-transparent" />

                <span className="relative z-10 font-heading text-xl font-black text-white tracking-tight">
                    M
                </span>
            </div>

            {/* Typography Stack */}
            <div className="flex flex-col justify-center leading-tight">
                <span className="font-heading text-lg font-bold tracking-tight text-white transition-colors duration-300 group-hover:text-emerald-300">
                    Media Manager
                </span>

                <span className="whitespace-nowrap font-ui text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400 transition-colors duration-300 group-hover:text-slate-300">
                    Media Slot Booking
                </span>
            </div>
        </Link>
    );
}