"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShoppingCart, Trash2, Radio, ArrowRight, Plus } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useCart, groupByCampaign, advertiserPaths, MAX_CART_ITEMS } from "@/lib/cart";
import { formatMoney } from "@/lib/status";
import { EmptyState, PageLoading } from "@/components/common/PageState";
import { discountPercentFor, useCheckoutDiscount } from "@/lib/discounts";

// The booking cart: spots from any number of stations, grouped by campaign.
// One checkout pays for one campaign's spots.

const slotLabel = { MORNING: "Morning", AFTERNOON: "Afternoon", PRIME_TIME: "Prime time", LATE_NIGHT: "Late night", EDITION: "Print edition" };

// List-price total, and the estimated discount (multi-station tiers + plan).
export const estimateTotal = (items, discountOptions) => {
    const priced = items.filter((i) => Number(i.price) > 0);
    const currencies = [...new Set(priced.map((i) => i.currency))];
    const amount = priced.reduce((sum, i) => sum + Number(i.price), 0);
    const stationCount = new Set(items.map((i) => i.stationId)).size;
    const { percent } = discountPercentFor(stationCount, discountOptions);
    const discount = Math.round(amount * percent) / 100;
    return {
        amount,
        currency: currencies[0] || "NGN",
        mixedCurrency: currencies.length > 1,
        unpriced: items.length - priced.length,
        stationCount,
        discountPercent: percent,
        discount,
        net: Math.round((amount - discount) * 100) / 100,
    };
};

export function CartItemRow({ item, index, onRemove }) {
    return (
        <li className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="flex min-w-0 gap-3">
                {index !== undefined && (
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {index + 1}
                    </span>
                )}
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-medium text-slate-900 dark:text-white">
                        <Radio className="h-4 w-4 shrink-0 text-emerald-500" />
                        {item.stationName}
                        {item.stationType && <span className="text-xs font-normal text-slate-400">· {item.stationType}</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {item.slot === "EDITION" ? `${item.date} · print edition` : `${item.date} at ${item.time} · ${item.duration} min · ${slotLabel[item.slot] || item.slot}`}
                        {item.rateName ? ` · ${item.rateName}` : ""}
                    </p>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {Number(item.price) > 0 ? formatMoney(item.price, item.currency) : "At checkout"}
                </span>
                {onRemove && (
                    <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                        aria-label={`Remove ${item.stationName} on ${item.date} from cart`}
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                )}
            </div>
        </li>
    );
}

export default function CartView() {
    const { ready, user } = useSession();
    const cart = useCart();
    const paths = advertiserPaths(user);
    const discountOptions = useCheckoutDiscount();

    if (!ready) return <PageLoading label="Loading your cart…" />;

    const groups = groupByCampaign(cart.items);

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                        <ShoppingCart className="h-6 w-6 text-emerald-500" />
                        Cart
                    </h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                        Spots you&apos;ve picked across stations. Pay once per campaign; stations receive your requests after payment.
                    </p>
                </div>
                <Link href={paths.stations} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                    <Plus className="h-4 w-4" /> Add more spots
                </Link>
            </motion.div>

            {groups.length === 0 ? (
                <EmptyState
                    icon={ShoppingCart}
                    title="Your cart is empty"
                    message="Browse stations, pick a date and time, and add the spots you want. You can mix radio, TV and other stations."
                    action={
                        <Link href={paths.stations} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                            <Radio className="h-4 w-4" /> Browse stations
                        </Link>
                    }
                />
            ) : (
                <div className="space-y-6">
                    {cart.count >= MAX_CART_ITEMS && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                            Your cart is full ({MAX_CART_ITEMS} spots). Check out a campaign before adding more.
                        </p>
                    )}
                    {groups.map((group) => {
                        const total = estimateTotal(group.items, discountOptions);
                        return (
                            <section key={group.campaignId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                <header className="flex flex-col justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center dark:border-slate-800">
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-slate-400">Campaign</p>
                                        <h2 className="font-semibold text-slate-900 dark:text-white">{group.campaignName}</h2>
                                    </div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {group.items.length} spot{group.items.length === 1 ? "" : "s"} ·{" "}
                                        {new Set(group.items.map((i) => i.stationId)).size} station{new Set(group.items.map((i) => i.stationId)).size === 1 ? "" : "s"}
                                    </p>
                                </header>
                                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {group.items.map((item) => (
                                        <CartItemRow key={item.id} item={item} onRemove={cart.removeItem} />
                                    ))}
                                </ul>
                                <footer className="flex flex-col justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-800/40">
                                    <p className="text-sm text-slate-600 dark:text-slate-300">
                                        Estimated total:{" "}
                                        {total.discount > 0 && <span className="mr-1 text-slate-400 line-through">{formatMoney(total.amount, total.currency)}</span>}
                                        <span className="font-semibold text-slate-900 dark:text-white">{formatMoney(total.net, total.currency)}</span>
                                        {total.discount > 0 && (
                                            <span className="block text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                                {total.discountPercent}% off ({total.stationCount} stations{discountOptions.planPercent ? ` + ${discountOptions.planName} plan` : ""})
                                            </span>
                                        )}
                                        {total.discount === 0 && total.stationCount < 3 && (
                                            <span className="block text-xs text-slate-400">Book 3 or more stations in one checkout for a discount.</span>
                                        )}
                                        <span className="block text-xs text-slate-400">Prices are confirmed by each station&apos;s rate at checkout.</span>
                                    </p>
                                    <Link
                                        href={`${paths.checkout}?campaign=${encodeURIComponent(group.campaignId)}`}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600"
                                    >
                                        Checkout <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </footer>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
