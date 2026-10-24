"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/api";

// The header bell: unread count, the latest notifications, mark as read.
// Checks again every minute and whenever the window regains focus.

const POLL_MS = 60000;

const timeAgo = (value) => {
    const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
};

export default function NotificationBell() {
    const router = useRouter();
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const boxRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const res = await getNotifications();
            setItems(res?.data || []);
            setUnread(res?.unread || 0);
        } catch {
            // The bell never interrupts the page; it tries again later.
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
        const id = setInterval(load, POLL_MS);
        const onFocus = () => load();
        window.addEventListener("focus", onFocus);
        return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
    }, [load]);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
    }, [open]);

    const openItem = async (n) => {
        setOpen(false);
        if (!n.readAt) {
            setItems((list) => list.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)));
            setUnread((u) => Math.max(0, u - 1));
            markNotificationRead(n._id).catch(() => {});
        }
        if (n.link) router.push(n.link);
    };

    const readAll = async () => {
        setItems((list) => list.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
        setUnread(0);
        markAllNotificationsRead().catch(() => {});
    };

    return (
        <div ref={boxRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
                aria-expanded={open}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</p>
                        {unread > 0 && (
                            <button type="button" onClick={readAll} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                            </button>
                        )}
                    </div>
                    {items.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">You&apos;re all caught up.</p>
                    ) : (
                        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                            {items.map((n) => (
                                <li key={n._id}>
                                    <button type="button" onClick={() => openItem(n)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${n.readAt ? "" : "bg-emerald-50/50 dark:bg-emerald-500/5"}`}>
                                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-emerald-500"}`} />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium text-slate-900 dark:text-white">{n.title}</span>
                                            {n.body && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{n.body}</span>}
                                            <span className="mt-1 block text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
