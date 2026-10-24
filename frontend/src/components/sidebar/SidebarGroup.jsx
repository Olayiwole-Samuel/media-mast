"use client";

import { memo } from "react";
import SidebarItem from "./SidebarItem";

const SidebarGroup = memo(function SidebarGroup({
    group,
    pathname,
    isCollapsed,
    startIndex = 0,
}) {
    return (
        <div className="space-y-1">
            {!isCollapsed && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {group.label}
                </p>
            )}
            {group.items.map((item, i) => {
                const isActive =
                    pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                    <SidebarItem
                        key={item.href}
                        item={item}
                        isActive={isActive}
                        isCollapsed={isCollapsed}
                        index={startIndex + i}
                    />
                );
            })}
        </div>
    );
});

export default SidebarGroup;