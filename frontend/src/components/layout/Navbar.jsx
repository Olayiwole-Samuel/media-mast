"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
    LayoutDashboard,
    CalendarDays,
    CreditCard,
    Settings,
    LogOut,
    ChevronDown,
    Building2,
    Shield,
} from "lucide-react";

import Link from "next/link";
import Logo from "../common/Logo";
import Button from "../common/Button";
import Container from "../common/Container";
import { NAV_LINKS } from "@/constants/navigation";
import { useSession, signOut } from "@/lib/auth";
import gsap from "gsap";

const HIDDEN_ROUTES = new Set([
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/accept-invite",
    "/change-password",
]);

// ── Role-based dashboard links (each points at an area that account can use) ──
const getDashboardLinks = (accountType) => {
    switch (accountType) {
        case "ADMIN":
            return [
                { label: "Dashboard", href: "/admin/dashboard", icon: Shield },
                { label: "Companies", href: "/admin/companies", icon: Building2 },
                { label: "Users", href: "/admin/users", icon: LayoutDashboard },
            ];

        case "COMPANY":
            return [
                { label: "Dashboard", href: "/company/dashboard", icon: LayoutDashboard },
                { label: "Bookings", href: "/company/bookings", icon: CalendarDays },
                { label: "Team", href: "/company/team", icon: Building2 },
                { label: "Settings", href: "/company/settings", icon: Settings },
            ];

        case "EMPLOYEE":
            return [
                { label: "Dashboard", href: "/company/dashboard", icon: LayoutDashboard },
                { label: "Campaigns", href: "/company/campaigns", icon: CreditCard },
                { label: "Bookings", href: "/company/bookings", icon: CalendarDays },
            ];

        case "STATION":
            return [{ label: "Station account", href: "/station", icon: LayoutDashboard }];

        case "INDIVIDUAL":
        default:
            return [
                { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
                { label: "Stations", href: "/stations", icon: CalendarDays },
                { label: "My account", href: "/settings", icon: Settings },
            ];
    }
};

function getInitial(name = "") {
    return name.trim().charAt(0).toUpperCase() || "U";
}

function Avatar({ user, size = "md", className = "" }) {
    const sizeMap = {
        sm: "h-8 w-8 text-xs",
        md: "h-9 w-9 text-sm",
        lg: "h-11 w-11 text-base",
    };

    if (user?.image) {
        return (
            <img
                src={user.image}
                alt={user.name || "User"}
                className={`${sizeMap[size]} rounded-full object-cover ring-2 ring-white/20 ${className}`}
            />
        );
    }

    return (
        <div
            className={`
                ${sizeMap[size]} flex items-center justify-center rounded-full
                bg-emerald-500 font-semibold text-white
                shadow-[0_4px_14px_rgba(16,185,129,0.35)]
                ring-2 ring-emerald-400/30
                ${className}
            `}
        >
            {getInitial(user?.name)}
        </div>
    );
}

function UserDropdown({ user, onSignOut, align = "right" }) {
    const [open, setOpen] = useState(false);
    const reduced = useReducedMotion();
    const containerRef = useRef(null);
    const menuRef = useRef(null);
    const triggerRef = useRef(null);

    // Get role-based dropdown links
    const dropdownLinks = getDashboardLinks(user?.accountType);

    const close = useCallback(() => setOpen(false), []);

    useEffect(() => {
        if (!open) return;

        function handlePointer(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                close();
            }
        }

        function handleKey(e) {
            if (e.key === "Escape") {
                close();
                triggerRef.current?.focus();
            }
        }

        document.addEventListener("mousedown", handlePointer);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handlePointer);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open, close]);

    useEffect(() => {
        if (!open || !menuRef.current) return;

        const focusable = menuRef.current.querySelectorAll(
            'a[href], button:not([disabled])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        function trap(e) {
            if (e.key !== "Tab") return;
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                }
            } else if (document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        }

        document.addEventListener("keydown", trap);
        first?.focus();
        return () => document.removeEventListener("keydown", trap);
    }, [open]);

    // If no user, don't render dropdown
    if (!user) return null;

    return (
        <div ref={containerRef} className="relative z-[60]">
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="User menu"
                className="
                    group flex items-center gap-2 rounded-full
                    border border-white/10 bg-white/5 p-1 pr-2.5
                    transition-all duration-300
                    hover:border-white/20 hover:bg-white/10
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50
                "
            >
                <motion.div
                    whileHover={
                        reduced
                            ? undefined
                            : {
                                scale: 1.05,
                                boxShadow: "0 6px 18px rgba(16,185,129,0.35)",
                            }
                    }
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="rounded-full"
                >
                    <Avatar user={user} size="md" />
                </motion.div>
                <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-300 ${
                        open ? "rotate-180" : ""
                    }`}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        ref={menuRef}
                        role="menu"
                        initial={
                            reduced
                                ? false
                                : { opacity: 0, scale: 0.96, y: -8 }
                        }
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: -6 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
                        className={`
                            absolute top-full z-[70] mt-2.5 w-[300px]
                            overflow-hidden rounded-3xl
                            border border-white/10 bg-[#0c1628]/95
                            shadow-[0_25px_60px_-12px_rgba(0,0,0,0.55),0_8px_24px_-8px_rgba(0,0,0,0.35)]
                            backdrop-blur-2xl
                            ${align === "right" ? "right-0" : "left-0"}
                        `}
                    >
                        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
                            <Avatar user={user} size="lg" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[14px] font-semibold text-white">
                                    {user?.name || "User"}
                                </p>
                                <p className="truncate text-[12.5px] text-slate-400">
                                    {user?.email || ""}
                                </p>
                                {user?.accountType && (
                                    <p className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">
                                        {user.accountType}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="p-2">
                            {dropdownLinks.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.label}
                                        href={item.href}
                                        role="menuitem"
                                        onClick={close}
                                        className="
                                            group flex items-center gap-3 rounded-xl px-3 py-2.5
                                            text-[13.5px] font-medium text-slate-300
                                            transition-all duration-200
                                            hover:translate-x-1 hover:bg-emerald-500/10 hover:text-emerald-300
                                            focus:outline-none focus-visible:bg-emerald-500/10 focus-visible:text-emerald-300
                                        "
                                    >
                                        <Icon className="h-4 w-4 text-slate-500 transition-all duration-200 group-hover:scale-110 group-hover:text-emerald-400" />
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </div>

                        <div className="mx-3 border-t border-white/10" />

                        <div className="p-2">
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    close();
                                    onSignOut?.();
                                }}
                                className="
                                    group flex w-full items-center gap-3 rounded-xl px-3 py-2.5
                                    text-[13.5px] font-medium text-red-400
                                    transition-all duration-200
                                    hover:translate-x-1 hover:bg-red-500/10 hover:text-red-300
                                    focus:outline-none focus-visible:bg-red-500/10
                                "
                            >
                                <LogOut className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                                Sign Out
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function Navbar() {
    const { ready, user: sessionUser, hasToken } = useSession();
    const user = hasToken ? sessionUser : null;
    const isMounted = ready;
    const pathname = usePathname();
    const isHiddenRoute = HIDDEN_ROUTES.has(pathname);
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeSection, setActiveSection] = useState("home");
    const navRef = useRef(null);
    const logoRef = useRef(null);
    const linksRef = useRef(null);
    const actionsRef = useRef(null);

    // useSession reads localStorage only after hydration (no mismatch).
    const isAuthenticated = !!user && isMounted;

    const handleSignOut = signOut;

    useEffect(() => {
        if (isHiddenRoute) return;

        const handleScroll = () => {
            setScrolled(window.scrollY > 30);

            const sections = [
                "home",
                "features",
                "explore",
                "stations",
                "pricing",
                "contact",
            ];

            const scrollPosition = window.scrollY + 140;

            for (const section of sections) {
                const element = document.getElementById(section);
                if (!element) continue;

                if (
                    scrollPosition >= element.offsetTop &&
                    scrollPosition < element.offsetTop + element.offsetHeight
                ) {
                    setActiveSection(section);
                    break;
                }
            }
        };

        window.addEventListener("scroll", handleScroll);
        handleScroll();

        const tl = gsap.timeline({
            defaults: {
                ease: "expo.out",
            },
        });

        tl.from(navRef.current, {
            y: -60,
            opacity: 0,
            duration: 0.9,
        })
            .from(
                logoRef.current,
                {
                    x: -40,
                    opacity: 0,
                    duration: 0.5,
                },
                "-=0.4"
            )
            .from(
                linksRef.current?.children || [],
                {
                    y: -20,
                    autoAlpha: 0,
                    stagger: 0.08,
                    duration: 0.4,
                    clearProps: "all",
                },
                "-=0.2"
            )
            .from(
                actionsRef.current?.children || [],
                {
                    x: 20,
                    autoAlpha: 0,
                    stagger: 0.12,
                    duration: 0.4,
                    clearProps: "all",
                },
                "-=0.3"
            );

        return () => {
            window.removeEventListener("scroll", handleScroll);
            tl.kill();
        };
    }, [isHiddenRoute]);

    if (isHiddenRoute) {
        return null;
    }

    return (
        <header className="fixed inset-x-0 top-0 z-50 transition-all duration-500">
            <Container className="relative max-w-[1550px]">
                <nav
                    ref={navRef}
                    className={`transition-all duration-500 ${
                        scrolled ? "mt-3" : "mt-5"
                    }`}
                >
                    <div
                        className={`relative flex items-center justify-between rounded-[26px] border transition-all duration-500 ${
                            scrolled
                                ? "h-16 border-white/15 bg-[#08111fe8] px-8 xl:px-12 shadow-[0_15px_55px_rgba(0,0,0,.45)]"
                                : "h-20 border-white/10 bg-white/5 px-10 xl:px-14 shadow-[0_15px_45px_rgba(0,0,0,.30)]"
                        } backdrop-blur-2xl`}
                    >
                        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/10 via-transparent to-cyan-400/10" />
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                            <div className="absolute left-8 top-0 h-full w-32 -skew-x-12 bg-gradient-to-r from-white/5 to-transparent" />
                        </div>

                        <div ref={logoRef} className="relative z-10 flex-shrink-0">
                            <Logo />
                        </div>

                        <div
                            ref={linksRef}
                            className="relative z-10 hidden flex-1 items-center justify-center gap-6 lg:flex xl:gap-8"
                        >
                            {NAV_LINKS.map((link) => (
                                <Link
                                    key={link.label}
                                    href={link.href}
                                    className={`group relative flex items-center gap-2 rounded-full px-4 py-2 font-ui text-[15px] font-medium tracking-wide transition-all duration-300 hover:-translate-y-0.5
                                        ${
                                            activeSection === link.href.replace("#", "")
                                                ? "bg-white/10 text-white"
                                                : "text-slate-300 hover:bg-white/5 hover:text-white"
                                        }
                                    `}
                                >
                                    <span
                                        className={`h-1.5 w-1.5 rounded-full transition-all duration-300
                                            ${
                                                activeSection === link.href.replace("#", "")
                                                    ? "scale-100 bg-emerald-400"
                                                    : "scale-0 bg-emerald-400 group-hover:scale-100"
                                            }
                                        `}
                                    />
                                    <span className="whitespace-nowrap">{link.label}</span>
                                    <span
                                        className={`absolute bottom-0 left-1/2 h-[2px] -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300
                                            ${
                                                activeSection === link.href.replace("#", "")
                                                    ? "w-10"
                                                    : "w-0 group-hover:w-10"
                                            }
                                        `}
                                    />
                                </Link>
                            ))}
                        </div>

                        <div
                            ref={actionsRef}
                            className="relative z-10 hidden flex-shrink-0 items-center gap-4 lg:flex xl:gap-5"
                        >
                            {isAuthenticated ? (
                                <UserDropdown user={user} onSignOut={handleSignOut} />
                            ) : (
                                <Link href="/login">
                                    <Button variant="primary">Get Started</Button>
                                </Link>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="relative z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-all duration-300 hover:border-emerald-400/40 hover:bg-white/10 lg:hidden"
                            aria-label="Toggle Menu"
                            aria-expanded={menuOpen}
                            aria-controls="mobile-navigation"
                        >
                            <div className="relative flex h-5 w-5 items-center justify-center">
                                <span
                                    className={`absolute h-[2px] w-5 rounded-full bg-white transition-all duration-300 ${
                                        menuOpen ? "rotate-45" : "-translate-y-[6px]"
                                    }`}
                                />
                                <span
                                    className={`absolute h-[2px] w-5 rounded-full bg-white transition-all duration-300 ${
                                        menuOpen ? "opacity-0" : "opacity-100"
                                    }`}
                                />
                                <span
                                    className={`absolute h-[2px] w-5 rounded-full bg-white transition-all duration-300 ${
                                        menuOpen ? "-rotate-45" : "translate-y-[6px]"
                                    }`}
                                />
                            </div>
                        </button>
                    </div>
                </nav>

                <div
                    className={`fixed inset-0 z-40 transition-all duration-500 lg:hidden ${
                        menuOpen
                            ? "pointer-events-auto opacity-100"
                            : "pointer-events-none opacity-0"
                    }`}
                >
                    <button
                        type="button"
                        aria-label="Close menu"
                        className="absolute inset-0 bg-black/80 backdrop-blur-2xl"
                        onClick={() => setMenuOpen(false)}
                    />

                    <div
                        id="mobile-navigation"
                        className={`absolute right-0 top-0 flex h-screen w-[85%] max-w-sm flex-col border-l border-white/10 bg-[#08111f] transition-transform duration-500 ${
                            menuOpen ? "translate-x-0" : "translate-x-full"
                        }`}
                    >
                        {isAuthenticated && (
                            <div className="mt-24 flex items-center gap-3 border-b border-white/8 px-8 pb-6">
                                <Avatar user={user} size="lg" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] font-semibold text-white">
                                        {user?.name || "User"}
                                    </p>
                                    <p className="truncate text-[13px] text-slate-400">
                                        {user?.email || ""}
                                    </p>
                                    {user?.accountType && (
                                        <p className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">
                                            {user.accountType}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        <div
                            className={`flex flex-col px-8 ${
                                isAuthenticated ? "mt-4" : "mt-32"
                            }`}
                        >
                            {NAV_LINKS.map((link) => (
                                <Link
                                    key={link.label}
                                    href={link.href}
                                    onClick={() => setMenuOpen(false)}
                                    className="border-b border-white/5 py-6 text-lg font-medium text-slate-300 transition-colors duration-300 hover:text-emerald-400"
                                >
                                    {link.label}
                                </Link>
                            ))}

                            {isAuthenticated &&
                                getDashboardLinks(user?.accountType).map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <Link
                                            key={item.label}
                                            href={item.href}
                                            onClick={() => setMenuOpen(false)}
                                            className="flex items-center gap-3 border-b border-white/5 py-5 text-[15px] font-medium text-slate-300 transition-colors duration-300 hover:text-emerald-400"
                                        >
                                            <Icon className="h-4 w-4 text-slate-500" />
                                            {item.label}
                                        </Link>
                                    );
                                })}
                        </div>

                        <div className="mt-auto space-y-4 px-8 pb-10">
                            {isAuthenticated ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        handleSignOut();
                                    }}
                                    className="
                                        flex w-full items-center justify-center gap-2 rounded-xl
                                        border border-red-500/20 bg-red-500/10 px-4 py-3
                                        text-[14px] font-medium text-red-400
                                        transition-colors hover:bg-red-500/15
                                    "
                                >
                                    <LogOut className="h-4 w-4" />
                                    Sign Out
                                </button>
                            ) : (
                                <Link href="/login" onClick={() => setMenuOpen(false)}>
                                    <Button variant="primary">Get Started</Button>
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </Container>
        </header>
    );
}