import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export function formatCurrency(value, currency = "NGN") {
    return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(value);
}

export function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
}