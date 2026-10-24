import { cn } from "@/lib/utils";

export default function Container({ children, className, ...props }) {
    return (
        <div
            className={cn(
                "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}