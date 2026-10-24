"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
}

export default function FadeUp({
    children,
    delay = 0,
    y = 40,
    duration = 0.8,
    className,
    ...props
}) {
    const ref = useRef(null);

    useEffect(() => {
        if (!ref.current) return;

        const ctx = gsap.context(() => {
            gsap.fromTo(
                ref.current,
                {
                    y,
                    autoAlpha: 0,
                },
                {
                    y: 0,
                    autoAlpha: 1,
                    duration,
                    delay,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: ref.current,
                        start: "top 88%",
                        once: true,
                    },
                }
            );
        }, ref);

        return () => ctx.revert();
    }, [delay, duration, y]);

    return (
        <div ref={ref} className={cn("will-change-transform", className)} {...props}>
            {children}
        </div>
    );
}