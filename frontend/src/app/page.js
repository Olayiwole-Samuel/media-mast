"use client";
import Hero from "@/components/sections/Hero";
import TrustedBy from "@/components/sections/TrustedBy";
import BookingProcess from "@/components/booking-process/BookingProcess";
import CampaignFeatures from "@/components/campaign-features/CampaignFeatures";
import Pricing from "@/components/pricing/Pricing";
import MediaCoverage from "@/components/mediaCoverage/MediaCoverage";
import Testimonials from "@/components/testimonials/Testimonials";
import CTA from "@/components/cta/CTA";
import Footer from "@/components/footer/Footer";

export default function Home() {
    return (
        <div>
            <Hero />
            <TrustedBy/>
            <BookingProcess />
            <CampaignFeatures/>
            <Pricing />
            <MediaCoverage />
            <Testimonials />
            <CTA /> 
            <Footer/>
        </div>
    );
}