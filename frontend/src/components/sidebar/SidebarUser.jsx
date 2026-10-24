"use client";

import { memo } from "react";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const SidebarUser = memo(function SidebarUser({
    session,
    isCollapsed,
}) {
    const name = session?.user?.name || "User";
    const email = session?.user?.email || "";
    const image = session?.user?.image;
    const initial = name.charAt(0).toUpperCase();

    return (
        <div
            className={cn(
                "shrink-0 border-t border-slate-200/80 p-3",
                isCollapsed && "flex flex-col items-center gap-2"
            )}
        >
            <div
                className={cn(
                    "flex items-center gap-3",
                    isCollapsed ? "flex-col" : "px-1"
                )}
            >
                {image ? (
                    <Image
                        src={image}
                        alt={name}
                        width={36}
                        height={36}
                        unoptimized
                        className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white"
                    />
                ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white ring-2 ring-white">
                        {initial}
                    </div>
                )}

                {!isCollapsed && (
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
                        <p className="truncate text-xs text-slate-500">{email}</p>
                    </div>
                )}
            </div>

            <button
                onClick={() => signOut({ callbackUrl: "/" })}
                title={isCollapsed ? "Logout" : undefined}
                className={cn(
                    "mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500",
                    "transition-all duration-200 hover:bg-red-50 hover:text-red-600",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30",
                    isCollapsed && "mt-0 justify-center px-2"
                )}
            >
                <LogOut className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span>Logout</span>}
            </button>
        </div>
    );
});

export default SidebarUser;
