import { cn } from "@/lib/utils";

const sizeStyles = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
};

const variantStyles = {
    primary:
        "bg-[var(--primary)] text-white shadow-lg shadow-emerald-500/20 hover:scale-[1.03] hover:shadow-emerald-500/40 active:scale-[0.98]",
    secondary:
        "bg-[var(--secondary-light)] text-white hover:scale-[1.03] active:scale-[0.98]",
    outline:
        "border border-white/20 text-white hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-[0.98]",
    ghost:
        "text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white active:scale-[0.98]",
};

export default function Button({
    children,
    variant = "primary",
    size = "md",
    className,
    disabled = false,
    type = "button",
    ...props
}) {
    return (
        <button
            type={type}
            disabled={disabled}
            className={cn(
                "group inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold transition-all duration-300 ease-out cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 disabled:pointer-events-none disabled:opacity-50",
                sizeStyles[size] || sizeStyles.md,
                variantStyles[variant] || variantStyles.primary,
                className
            )}
            {...props}
        >
            <span className="inline-flex items-center transition-transform duration-300 group-hover:-translate-x-0.5">
                {children}
            </span>

            {variant === "primary" && (
                <span className="ml-2 inline-block transition-transform duration-300 group-hover:translate-x-1">
                    →
                </span>
            )}
        </button>
    );
}