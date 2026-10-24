"use client";

import { useLayoutEffect } from "react";
import gsap from "gsap";

export default function useAuthAnimation(layoutRef) {
    useLayoutEffect(() => {
        if (!layoutRef.current) return;

        const ctx = gsap.context(() => {

            const tl = gsap.timeline({
                defaults: {
                    ease: "power3.out",
                },
            });

            tl.from(".auth-sidebar", {
                x: -80,
                opacity: 0,
                duration: 1,
            })

            .from(".auth-card", {
                y: 50,
                opacity: 0,
                duration: 0.8,
            }, "-=0.5")

            .from(".auth-card > *", {
                y: 20,
                opacity: 0,
                stagger: 0.08,
                duration: 0.45,
            }, "-=0.3");

        }, layoutRef);

        return () => ctx.revert();

    }, [layoutRef]);
}