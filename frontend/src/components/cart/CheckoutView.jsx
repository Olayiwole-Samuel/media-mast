"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CreditCard, Loader2, ShieldCheck, ArrowLeft, FlaskConical } from "lucide-react";
import { checkout } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useCart, groupByCampaign, advertiserPaths } from "@/lib/cart";
import { formatMoney } from "@/lib/status";
import { EmptyState, PageLoading } from "@/components/common/PageState";
import { CartItemRow, estimateTotal } from "@/components/cart/CartView";
import { useCheckoutDiscount } from "@/lib/discounts";

// Checkout for one campaign's spots: one payment, then every station gets
// its request. Payments currently run in TEST MODE (stub provider): no
// money is charged. The server re-prices everything; its total is final.

export default function CheckoutView() {
    const router = useRouter();
    const params = useSearchParams();
    const { ready, user } = useSession();
    const cart = useCart();
    const paths = advertiserPaths(user);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState("");
    const [needsPlan, setNeedsPlan] = useState(false);
    const discountOptions = useCheckoutDiscount();

    if (!ready) return <PageLoading label="Loading checkout…" />;

    const campaignId = params.get("campaign");
    const group = groupByCampaign(cart.items).find((g) => g.campaignId === campaignId);

    if (!group) {
        return (
            <div className="p-4 sm:p-6 lg:p-8">
                <EmptyState
                    icon={CreditCard}
                    title="Nothing to check out"
                    message="This campaign has no spots in your cart. Add spots from the stations page, then check out from your cart."
                    action={
                        <Link href={paths.cart} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600">
                            Go to cart
                        </Link>
                    }
                />
            </div>
        );
    }

    const total = estimateTotal(group.items, discountOptions);

    const handlePay = async () => {
        setError("");
        setNeedsPlan(false);
        setPaying(true);
        try {
            const result = await checkout({ campaignId: group.campaignId, items: group.items });
            cart.clearCampaign(group.campaignId);
            const paymentId = result?.data?.payment?._id;
            router.push(paymentId ? `${paths.confirmation}?payment=${encodeURIComponent(paymentId)}` : paths.bookings);
        } catch (err) {
            const code = err?.data?.code;
            if (code === "SUBSCRIPTION_REQUIRED") setNeedsPlan(true);
            setError(
                code === "SUBSCRIPTION_REQUIRED" || code === "PLAN_LIMIT"
                    ? err.message
                    : err?.status === 403
                    ? "You don't have permission to book for this campaign."
                    : err?.status === 409
                        ? `${err.message} Remove or change that spot, then try again.`
                        : err?.message || "Checkout failed. You have not been charged."
            );
            setPaying(false);
        }
    };

    return (
        <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
            <Link href={paths.cart} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                <ArrowLeft className="h-4 w-4" /> Back to cart
            </Link>

            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <CreditCard className="h-6 w-6 text-emerald-500" />
                    Checkout
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Campaign <span className="font-medium text-slate-700 dark:text-slate-200">{group.campaignName}</span> ·{" "}
                    {group.items.length} spot{group.items.length === 1 ? "" : "s"}
                </p>
            </motion.div>

            <div className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                <FlaskConical className="h-5 w-5 shrink-0" />
                <p>
                    <span className="font-semibold">Test mode.</span> Online payment isn&apos;t connected yet, so no money is charged. Your booking
                    requests are still recorded and sent to the stations exactly as they will be with real payments.
                </p>
            </div>

            {(needsPlan || (discountOptions.required && discountOptions.hasPlan === false)) && (
                <div className="mb-4 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <p>Booking needs a plan. Your cart stays here while you choose one.</p>
                    <Link href={paths.subscription} className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 font-medium text-white hover:bg-emerald-600">Choose a plan</Link>
                </div>
            )}

            {error && !needsPlan && (
                <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                    {error}
                </div>
            )}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {group.items.map((item, index) => (
                        <CartItemRow key={item.id} item={item} index={index} />
                    ))}
                </ul>
                <div className="space-y-1 border-t border-slate-200 bg-slate-50 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-800/40">
                    {total.discount > 0 && (
                        <>
                            <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                <span>Spots ({total.stationCount} stations)</span>
                                <span>{formatMoney(total.amount, total.currency)}</span>
                            </div>
                            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                                <span>Discount {total.discountPercent}%{discountOptions.planPercent ? ` (incl. ${discountOptions.planName} plan ${discountOptions.planPercent}%)` : ""}</span>
                                <span>−{formatMoney(total.discount, total.currency)}</span>
                            </div>
                        </>
                    )}
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                        <span>Estimated total</span>
                        <span className="text-base font-semibold text-slate-900 dark:text-white">{formatMoney(total.net, total.currency)}</span>
                    </div>
                    {(total.unpriced > 0 || total.mixedCurrency) && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                            {total.mixedCurrency
                                ? "These stations use different currencies; a checkout must use one currency, so split them into separate campaigns."
                                : "Some stations haven't listed a price; they can't be booked until they do."}
                        </p>
                    )}
                    <p className="text-xs text-slate-400">The final amount is calculated from each station&apos;s current rate when you pay.</p>
                </div>
            </section>

            <button
                type="button"
                onClick={handlePay}
                disabled={paying}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-base font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
                {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                {paying ? "Processing…" : `Pay ${formatMoney(total.net, total.currency)} (test mode)`}
            </button>
            <p className="mt-3 text-center text-xs text-slate-400">
                If a station declines or you cancel before airing, that spot is refunded.
            </p>
        </div>
    );
}
