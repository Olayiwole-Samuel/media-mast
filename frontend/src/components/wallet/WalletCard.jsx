"use client";

import Link from "next/link";
import { Wallet as WalletIcon, Plus, AlertTriangle } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { useSession } from "@/lib/auth";
import { advertiserPaths } from "@/lib/cart";
import { formatMoney } from "@/lib/status";

// Dashboard summary: balance, funded, spent, left — with a quick top-up link.
export default function WalletCard() {
    const { user } = useSession();
    const paths = advertiserPaths(user);
    const { wallet, loading } = useWallet();
    const currency = wallet?.currency || "NGN";
    const funded = wallet?.totalFunded || 0;
    const spent = wallet?.totalSpent || 0;
    const held = wallet?.held || 0;
    const used = funded > 0 ? Math.min(100, Math.round(((spent + held) / funded) * 100)) : 0;

    return (
        <section className={`rounded-2xl border p-5 ${wallet?.isLow ? "border-red-300 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/5" : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-slate-900"}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white"><WalletIcon className="h-5 w-5" /></span>
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Wallet: available to book</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{loading && !wallet ? "…" : formatMoney(wallet?.balance || 0, currency)}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Link href={paths.wallet} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">History</Link>
                    <Link href={paths.wallet} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"><Plus className="h-4 w-4" /> Fund wallet</Link>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><p className="text-xs text-slate-500 dark:text-slate-400">Funded</p><p className="font-semibold text-slate-900 dark:text-white">{formatMoney(funded, currency)}</p></div>
                <div><p className="text-xs text-slate-500 dark:text-slate-400">On hold (not aired yet)</p><p className="font-semibold text-amber-600 dark:text-amber-400">{formatMoney(held, currency)}</p></div>
                <div><p className="text-xs text-slate-500 dark:text-slate-400">Spent (aired)</p><p className="font-semibold text-slate-900 dark:text-white">{formatMoney(spent, currency)}</p></div>
                <div><p className="text-xs text-slate-500 dark:text-slate-400">Available</p><p className="font-semibold text-emerald-700 dark:text-emerald-300">{formatMoney(wallet?.balance || 0, currency)}</p></div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-label={`${used}% of funds spent`}>
                <div className={`h-full rounded-full ${wallet?.isLow ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${used}%` }} />
            </div>
            {wallet?.isLow && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-red-700 dark:text-red-300"><AlertTriangle className="h-4 w-4" /> Running low: below your {formatMoney(wallet.lowBalanceThreshold, currency)} alert.</p>
            )}
        </section>
    );
}
