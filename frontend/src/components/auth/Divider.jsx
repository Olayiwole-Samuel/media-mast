import { cn } from "@/lib/utils";

export default function Divider({ text = "or", className }) {
    return (
        <div
            role="separator"
            className={cn("relative flex items-center gap-4 py-1.5", className)}
        >
            <div
                aria-hidden="true"
                className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-slate-200"
            />
            {text && (
                <span className="shrink-0 text-[11.5px] font-medium uppercase tracking-wider text-slate-400 select-none">
                    {text}
                </span>
            )}
            <div
                aria-hidden="true"
                className="h-px flex-1 bg-gradient-to-l from-transparent via-slate-200 to-slate-200"
            />
        </div>
    );
}