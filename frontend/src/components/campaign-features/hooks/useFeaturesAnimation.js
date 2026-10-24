"use client";

import { useLayoutEffect, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

gsap.registerPlugin(ScrollTrigger);

export default function useFeaturesAnimation(sectionRef) {
    useIsomorphicLayoutEffect(() => {
        if (!sectionRef.current) return;

        ScrollTrigger.refresh();

        const ctx = gsap.context(() => {
            const cards = gsap.utils.toArray(".feature-card");

            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: "top 80%",
                    once: true,
                },
            });

            tl.from(".features-badge", {
                y: 20,
                opacity: 0,
                duration: 0.4,
                ease: "power3.out",
                clearProps: "opacity,transform",
            })
            .from(
                ".features-heading",
                {
                    y: 35,
                    opacity: 0,
                    duration: 0.5,
                    ease: "power3.out",
                    clearProps: "opacity,transform",
                },
                "-=0.25"
            )
            .from(
                ".features-description",
                {
                    y: 20,
                    opacity: 0,
                    duration: 0.45,
                    ease: "power3.out",
                    clearProps: "opacity,transform",
                },
                "-=0.3"
            )
            .from(
                cards,
                {
                    y: 45,
                    opacity: 0,
                    stagger: 0.1,
                    duration: 0.55,
                    ease: "power3.out",
                    clearProps: "opacity,transform",
                },
                "-=0.2"
            )
            .from(
                ".feature-icon",
                {
                    scale: 0.5,
                    opacity: 0,
                    stagger: 0.08,
                    duration: 0.4,
                    ease: "back.out(1.7)",
                    clearProps: "opacity,transform",
                },
                "-=0.45"
            );
        }, sectionRef);

        return () => ctx.revert();
    }, [sectionRef]);
}