import Link from "next/link";
import { cn } from "@/lib/utils";

export default function AuthFooter({ text, linkText, href, className }) {
    return (
        <p
            className={cn(
                "pt-6 text-center text-sm leading-relaxed text-slate-500",
                className
            )}
        >
            {text && <span>{text} </span>}
            {href && linkText && (
                <Link
                    href={href}
                    className="font-semibold text-emerald-600 transition-colors hover:text-emerald-700 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                    {linkText}
                </Link>
            )}
        </p>
    );
}