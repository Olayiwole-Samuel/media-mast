"use client";

import { useLayoutEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function useTestimonialsAnimation(sectionRef) {

    useLayoutEffect(() => {

        if (!sectionRef.current) return;

        const ctx = gsap.context(() => {

            // Entrance Animation

            const tl = gsap.timeline({

                scrollTrigger: {

                    trigger: sectionRef.current,

                    start: "top 75%",

                    once: true,

                },

            });

            tl.from(".testimonial-heading", {

                y: 60,
                opacity: 0,
                duration: 0.8,
                ease: "power3.out",

            })

            .from(".testimonial-card", {

                y: 80,
                opacity: 0,
                duration: 0.8,
                stagger: 0.15,
                ease: "power3.out",

            }, "-=0.3");

            // Infinite Marquee

            const marquee = gsap.to(".testimonial-track", {

                xPercent: -50,

                duration: 35,

                ease: "none",

                repeat: -1,

            });

            // Pause on Hover

            const track = document.querySelector(".testimonial-track");

            if (track) {

                track.addEventListener("mouseenter", () => {

                    marquee.pause();

                });

                track.addEventListener("mouseleave", () => {

                    marquee.resume();

                });

            }

        }, sectionRef);

        return () => ctx.revert();

    }, [sectionRef]);

}