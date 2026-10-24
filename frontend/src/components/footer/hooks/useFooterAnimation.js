"use client";

import { useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function useFooterAnimation(footerRef) {

    useLayoutEffect(() => {

        if (!footerRef.current) return;

        const ctx = gsap.context(() => {

            const brand = footerRef.current.querySelector(".footer-brand");
            const linkGroups = footerRef.current.querySelectorAll(".footer-links");
            const bottom = footerRef.current.querySelector(".footer-bottom");

            const tl = gsap.timeline({

                scrollTrigger: {

                    trigger: footerRef.current,
                    start: "top 85%",
                    once: true,

                },

            });

            tl.from(brand, {

                y: 60,
                opacity: 0,
                duration: 0.8,
                ease: "power3.out",

            })

            .from(linkGroups, {

                y: 50,
                opacity: 0,
                duration: 0.7,
                stagger: 0.15,
                ease: "power3.out",

            }, "-=0.4")

            .from(bottom, {

                opacity: 0,
                y: 30,
                duration: 0.6,
                ease: "power3.out",

            }, "-=0.2");

        }, footerRef);

        return () => ctx.revert();

    }, [footerRef]);

}
