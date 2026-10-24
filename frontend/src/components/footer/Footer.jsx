"use client";

import {
    AtSign,
    Globe,
    MessageCircle,
    Share2,
} from "lucide-react";

import { useRef } from "react";
import useFooterAnimation from "./hooks/useFooterAnimation";

export default function Footer() {

    const footerRef = useRef(null);

    useFooterAnimation(footerRef);

    const socialLinks = [
        {
            icon: Globe,
            label: "Facebook",
        },
        {
            icon: MessageCircle,
            label: "Twitter",
        },
        {
            icon: Share2,
            label: "LinkedIn",
        },
        {
            icon: AtSign,
            label: "Instagram",
        },
    ];

    return (

        <footer
            ref={footerRef}
            className="
                relative
                overflow-hidden
                border-t
                border-white/10
                bg-[#020617]
                py-24
            "
        >

            {/* Top Glow */}

            <div
                className="
                    absolute
                    left-1/2
                    top-0
                    h-52
                    w-[700px]
                    -translate-x-1/2
                    rounded-full
                    bg-emerald-500/10
                    blur-[120px]
                "
            />

            <div className="relative z-10 mx-auto max-w-7xl px-6">

                <div
                    className="
                        grid
                        gap-16
                        lg:grid-cols-[1.6fr_1fr_1fr_1fr]
                    "
                >

                    {/* Brand */}

                    <div className="footer-brand">

                        <h2
                            className="
                                cursor-pointer
                                text-3xl
                                font-black
                                text-white
                                transition-all
                                duration-300
                                hover:tracking-wide
                            "
                        >
                            Media
                            <span className="text-emerald-400">
                                Manager
                            </span>
                        </h2>

                        <p
                            className="
                                mt-6
                                max-w-sm
                                leading-8
                                text-slate-400
                            "
                        >
                            Simplifying media buying across Nigeria through one
                            powerful platform.
                        </p>

                        <div className="mt-8 flex gap-4">

                            {socialLinks.map(({ icon: Icon, label }) => (

                                <button
                                    key={label}
                                    type="button"
                                    aria-label={label}
                                    className="
                                        flex
                                        h-12
                                        w-12
                                        items-center
                                        justify-center
                                        rounded-full
                                        border
                                        border-white/10
                                        bg-white/5
                                        text-slate-400
                                        transition-all
                                        duration-300
                                        hover:-translate-y-1
                                        hover:scale-110
                                        hover:border-emerald-500
                                        hover:bg-emerald-500
                                        hover:text-white
                                        hover:shadow-[0_10px_30px_rgba(16,185,129,.35)]
                                    "
                                >

                                    <Icon size={18} />

                                </button>

                            ))}

                        </div>

                    </div>

                    {/* Product */}

                    <div className="footer-links">

                        <h3 className="font-bold text-white">
                            Product
                        </h3>

                        <ul className="mt-6 space-y-4">

                            <li>
                                <a
                                    href="#features"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Features
                                </a>
                            </li>

                            <li>
                                <a
                                    href="#pricing"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Pricing
                                </a>
                            </li>

                            <li>
                                <a
                                    href="#coverage"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Media Coverage
                                </a>
                            </li>

                            <li>
                                <a
                                    href="#"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Book Campaign
                                </a>
                            </li>

                        </ul>

                    </div>

                    {/* Company */}

                    <div className="footer-links">

                        <h3 className="font-bold text-white">
                            Company
                        </h3>

                        <ul className="mt-6 space-y-4">

                            <li>
                                <a
                                    href="#"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    About
                                </a>
                            </li>

                            <li>
                                <a
                                    href="#"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Contact
                                </a>
                            </li>

                            <li>
                                <a
                                    href="#"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Careers
                                </a>
                            </li>

                            <li>
                                <a
                                    href="#"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Blog
                                </a>
                            </li>

                        </ul>

                    </div>

                    {/* Resources */}

                    <div className="footer-links">

                        <h3 className="font-bold text-white">
                            Resources
                        </h3>

                        <ul className="mt-6 space-y-4">

                            <li>
                                <a
                                    href="#"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Help Center
                                </a>
                            </li>

                            <li>
                                <a
                                    href="#"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Privacy Policy
                                </a>
                            </li>

                            <li>
                                <a
                                    href="#"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Terms of Service
                                </a>
                            </li>

                            <li>
                                <a
                                    href="#"
                                    className="
                                        text-slate-400
                                        transition-colors
                                        duration-300
                                        hover:text-emerald-400
                                    "
                                >
                                    Support
                                </a>
                            </li>

                        </ul>

                    </div>

                </div>

                {/* Bottom */}

                <div
                    className="
                        footer-bottom
                        mt-20
                        flex
                        flex-col
                        items-center
                        justify-between
                        gap-4
                        border-t
                        border-white/10
                        pt-8
                        text-sm
                        text-slate-500
                        md:flex-row
                    "
                >

                    <p>
                        © 2026 Media Manager. All rights reserved.
                    </p>

                    <p>
                        Made with ❤️ in Nigeria
                    </p>

                </div>

            </div>

        </footer>

    );

}
