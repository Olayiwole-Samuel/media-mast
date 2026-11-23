"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import SupportBanner from "@/components/layout/SupportBanner";
import "./global.css";

export default function RootLayout({ children }) {
    const pathname = usePathname();
    
    // Hide navbar on all protected pages (dashboard and subpages)
    const protectedRoutes = [
        "/dashboard",
        "/stations",
        "/cart",
        "/checkout",
        "/confirmation",
        "/bookings",
        "/campaigns",
        "/documents",
        "/analytics",
        "/subscription",
        "/settings",
        "/book",
        "/wallet",
        // A client reviewing a shared plan; an admin opening a support view.
        "/plan-review",
        "/print",
        "/invoices",
        "/support-view",
        "/company",
        "/admin",
        // A business awaiting approval
        "/verify",
        // Station desk (station managers)
        "/station",
    ];
    
    const hideNavbar = protectedRoutes.some(route => 
        pathname === route || pathname?.startsWith(route + "/")
    );

    return (
        <html lang="en">
            <body>
                <SupportBanner />
                {!hideNavbar && <Navbar />}
                {children}
            </body>
        </html>
    );
}