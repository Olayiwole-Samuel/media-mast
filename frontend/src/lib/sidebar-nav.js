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
    LogOut,
} from "lucide-react";

export const NAV_GROUPS = [
    {
        id: "main",
        label: "Main",
        items: [
            { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            { label: "Stations", href: "/stations", icon: RadioTower },
            { label: "Cart", href: "/cart", icon: ShoppingCart, badge: null },
            { label: "Bookings", href: "/bookings", icon: CalendarDays, badge: 12 },
            { label: "Campaigns", href: "/campaigns", icon: Target, badge: 3 },
        ],
    },
    {
        id: "operations",
        label: "Operations",
        items: [
            { label: "Documents", href: "/documents", icon: FolderOpen },
            { label: "Analytics", href: "/analytics", icon: ChartColumn },
            { label: "Subscription", href: "/subscription", icon: Gem },
        ],
    },
    {
        id: "account",
        label: "Account",
        items: [
            { label: "Settings", href: "/settings", icon: Settings },
            { label: "Help", href: "/help", icon: CircleHelp },
        ],
    },
];

export const BACK_TO_WEBSITE = {
    label: "Back to Website",
    href: "/",
    icon: ArrowLeft,
    tooltip: "Return to the public website",
};

export const LOGOUT_ITEM = {
    label: "Logout",
    icon: LogOut,
};