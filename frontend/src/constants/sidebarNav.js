import {
    LayoutDashboard,
    RadioTower,
    ShoppingCart,
    CalendarDays,
    Target,
    FolderOpen,
    ChartColumn,
    Gem,
    Settings,
    CircleHelp,
    ArrowLeft,
} from "lucide-react";

export const SIDEBAR_WIDTH = {
    expanded: 280,
    collapsed: 88,
};

export const MAIN_NAV = [
    {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
    },
    {
        label: "Stations",
        href: "/stations",
        icon: RadioTower,
    },
    {
        label: "Cart",
        href: "/cart",
        icon: ShoppingCart,
        badge: null,
    },
    {
        label: "Bookings",
        href: "/bookings",
        icon: CalendarDays,
        badge: 12,
    },
    {
        label: "Campaigns",
        href: "/campaigns",
        icon: Target,
        badge: 3,
    },
];

export const OPERATIONS_NAV = [
    {
        label: "Documents",
        href: "/documents",
        icon: FolderOpen,
    },
    {
        label: "Analytics",
        href: "/analytics",
        icon: ChartColumn,
    },
    {
        label: "Subscription",
        href: "/subscription",
        icon: Gem,
    },
];

export const ACCOUNT_NAV = [
    {
        label: "Settings",
        href: "/settings",
        icon: Settings,
    },
    {
        label: "Help",
        href: "/help",
        icon: CircleHelp,
    },
];

export const BACK_TO_WEBSITE = {
    label: "Back to Website",
    href: "/",
    icon: ArrowLeft,
    tooltip: "Return to the public website",
};

// Future-ready: filter by role / permission
export function getVisibleNav(items, { role, permissions } = {}) {
    return items.filter((item) => {
        if (item.roles && role && !item.roles.includes(role)) return false;
        if (item.permission && permissions && !permissions.includes(item.permission))
            return false;
        return true;
    });
}