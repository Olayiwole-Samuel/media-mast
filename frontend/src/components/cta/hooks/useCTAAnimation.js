"use client";

import { useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function useCTAAnimation(sectionRef) {

    useLayoutEffect(() => {

        if (!sectionRef.current) return;

        const ctx = gsap.context(() => {

            const tl = gsap.timeline({

                scrollTrigger: {

                    trigger: sectionRef.current,

                    start: "top 75%",

                    once: true,

                },

            });

            tl.from(".cta-badge", {

                y: 30,
                opacity: 0,
                duration: 0.5,
                ease: "power3.out",

            })

            .from(".cta-title", {

                y: 60,
                opacity: 0,
                duration: 0.8,
                ease: "power3.out",

            }, "-=0.2")

            .from(".cta-text", {

                y: 40,
                opacity: 0,
                duration: 0.6,
                ease: "power3.out",

            }, "-=0.4")

            .from(".cta-buttons", {

                y: 40,
                opacity: 0,
                duration: 0.6,
                ease: "power3.out",

            }, "-=0.3");

        }, sectionRef);

        return () => ctx.revert();

    }, [sectionRef]);

}