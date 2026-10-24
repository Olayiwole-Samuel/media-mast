"use client";

import { useEffect, useState } from "react";
import PricingCard from "./PricingCard";
import { pricingPlans } from "./data/pricingPlans";
import { getPlans } from "@/lib/api";
import { formatMoney } from "@/lib/status";

// Plans come from the server (admins edit prices and limits there); the
// static list is shown until they load, or if the server can't be reached.

const featuresFor = (p) => [
    p.maxActiveCampaigns == null ? "Unlimited active campaigns" : `${p.maxActiveCampaigns} active campaigns`,
    "TV, radio & press booking",
    p.storageMB >= 1024 ? `${Math.round(p.storageMB / 1024)} GB document storage` : `${p.storageMB} MB document storage`,
    p.teamSeats == null ? "Unlimited team seats" : `${p.teamSeats} team seats`,
    p.discountPercent > 0 ? `Extra ${p.discountPercent}% off every checkout` : "Multi-station discounts",
    "Booking & slot reminders by email and SMS",
];

const fromServer = (p) => ({
    id: p.code,
    name: p.name,
    description: p.description,
    monthlyPrice: p.monthlyPrice == null ? "Custom" : formatMoney(p.monthlyPrice, p.currency),
    annualPrice: p.annualPrice == null ? "Custom" : formatMoney(p.annualPrice, p.currency),
    features: featuresFor(p),
    buttonText: p.priceOnRequest ? "Contact Sales" : "Get Started",
    href: p.priceOnRequest ? "#contact" : "/login",
    popular: p.highlighted,
});

export default function PricingGrid({
    isAnnual,
}) {

    const [plans, setPlans] = useState(pricingPlans);

    useEffect(() => {
        let live = true;
        getPlans()
            .then((res) => {
                const list = res?.data?.plans || [];
                if (live && list.length) setPlans(list.map(fromServer));
            })
            .catch(() => {});
        return () => { live = false; };
    }, []);

    return (

        <div
            className="
                mt-20
                grid
                gap-8
                lg:grid-cols-3
            "
        >

            {plans.map((plan) => (

                <PricingCard
                    key={plan.id}
                    name={plan.name}
                    description={plan.description}
                    monthlyPrice={plan.monthlyPrice}
                    annualPrice={plan.annualPrice}
                    features={plan.features}
                    buttonText={plan.buttonText}
                    href={plan.href || (plan.monthlyPrice === "Custom" ? "#contact" : "/login")}
                    popular={plan.popular}
                    isAnnual={isAnnual}
                />

            ))}

        </div>

    );

}
