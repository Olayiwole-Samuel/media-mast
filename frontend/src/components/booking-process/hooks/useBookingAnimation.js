"use client";

import { useLayoutEffect, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

gsap.registerPlugin(ScrollTrigger);

export default function useBookingAnimation(sectionRef) {
    useIsomorphicLayoutEffect(() => {
        if (!sectionRef.current) return;

        // Force ScrollTrigger to calculate exact DOM bounds
        ScrollTrigger.refresh();

        const ctx = gsap.context(() => {
            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: "top 85%", // Triggers higher up the viewport so elements are never stuck hidden
                    once: true,
                },
            });

            tl.from(".booking-heading", {
                y: 30,
                opacity: 0,
                duration: 0.5,
                ease: "power3.out",
                clearProps: "opacity,transform",
            })
            .from(
                ".booking-description",
                {
                    y: 20,
                    opacity: 0,
                    duration: 0.4,
                    ease: "power3.out",
                    clearProps: "opacity,transform",
                },
                "-=0.2"
            )
            .from(
                ".booking-step",
                {
                    y: 30,
                    opacity: 0,
                    stagger: 0.12,
                    duration: 0.5,
                    ease: "power3.out",
                    clearProps: "opacity,transform", // Removes inline opacity styles when complete
                },
                "-=0.2"
            )
            .to(
                ".booking-progress",
                {
                    width: "80%",
                    duration: 1.2,
                    ease: "power2.inOut",
                },
                "-=0.2"
            );
        }, sectionRef);

        return () => ctx.revert();
    }, [sectionRef]);
}