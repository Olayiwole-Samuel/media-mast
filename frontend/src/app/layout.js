"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
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
        "/insights",
        "/company",
        "/admin",
        // Station desk (station managers)
        "/station",
    ];
    
    const hideNavbar = protectedRoutes.some(route => 
        pathname === route || pathname?.startsWith(route + "/")
    );

    return (
        <html lang="en">
            <body>
                {!hideNavbar && <Navbar />}
                {children}
            </body>
        </html>
    );
}