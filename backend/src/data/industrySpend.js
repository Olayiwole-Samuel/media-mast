// ─────────────────────────────────────────────────────────────
// NIGERIA ADVERTISING SPEND — published estimates, with sources.
//
// These are third-party figures, quoted as reported (currency and year as
// published; they come from different bodies and methods, so they are not
// added together). Update this file when newer reports are released.
// Researched October 2026.
// ─────────────────────────────────────────────────────────────

const INDUSTRY_SPEND = {
    asOf: '2026-10',
    // Spend by medium (Statista Market Insights forecasts, as reported).
    byMedium: [
        {
            medium: 'TV',
            label: 'Traditional TV',
            year: 2025,
            amount: 401.5,
            unit: 'USD million',
            source: 'Statista, via Marketing Edge',
            url: 'https://marketingedge.com.ng/?p=188618',
            note: 'Forecast to reach US$448.5m by 2029 (2.81% a year).',
        },
        {
            medium: 'OUTDOOR',
            label: 'Out-of-home (billboards)',
            year: 2025,
            amount: 174.0,
            unit: 'USD million',
            source: 'Statista, via The Guardian Nigeria',
            url: 'https://guardian.ng/opinion/changing-face-of-out-of-home-digital-advertising-in-nigeria/',
            note: 'Statista projects US$200.3m by 2029.',
        },
        {
            medium: 'SOCIAL',
            label: 'Social media',
            year: 2024,
            amount: 130.6,
            unit: 'USD million',
            source: 'Statista, via Brand Communicator',
            url: 'https://brandcom.ng/?p=57791',
            note: 'Projected to grow 10.68% a year to US$216.9m by 2029.',
        },
        {
            medium: 'RADIO',
            label: 'Traditional radio',
            year: 2025,
            amount: 50.1,
            unit: 'USD million',
            source: 'Statista Market Insights',
            url: 'https://www.statista.com/outlook/amo/advertising/audio-advertising/traditional-radio-advertising/nigeria',
            note: 'Roughly flat: 0.43% a year to US$50.96m by 2029.',
        },
        {
            medium: 'PRESS',
            label: 'Newspapers',
            year: 2025,
            amount: 27.94,
            unit: 'USD million',
            source: 'Statista, via Marketing Edge',
            url: 'https://marketingedge.com.ng/?p=190964',
            note: 'Declining about 5.2% a year (2024–2029).',
        },
    ],
    // Headline totals.
    totals: [
        {
            label: 'Total advertising spend',
            year: 2025,
            amount: 1.04,
            unit: 'USD billion',
            source: 'Statista, via Brand Communicator',
            url: 'https://brandcom.ng/?p=57791',
        },
        {
            label: 'Marketing communications spend',
            year: 2023,
            amount: 605.2,
            unit: 'NGN billion',
            source: 'PwC report for ARCON, via Nairametrics',
            url: 'https://nairametrics.com/2024/06/12/nigerias-advertising-industry-to-hit-n893-billion-by-2028-report/',
            note: 'Up from ₦216bn in 2018 (18.7% a year); projected ₦893bn by 2028.',
        },
        {
            label: 'Internet advertising (outlook)',
            year: 2030,
            amount: 439,
            unit: 'USD million',
            source: 'PwC Africa Entertainment & Media Outlook 2026–2030, via Blueprint',
            url: 'https://blueprint.ng/nigerias-entertainment-media-market-to-hit-5-3bn-by-2030-pwc/',
            note: 'Growing from US$279m, 9.5% a year.',
        },
    ],
    // The marketing-communications split published by PwC/ARCON (2018–2023 average).
    marketingShare: {
        period: '2018–2023',
        source: 'PwC report for ARCON, via Nairametrics',
        url: 'https://nairametrics.com/2024/06/12/nigerias-advertising-industry-to-hit-n893-billion-by-2028-report/',
        shares: [
            { label: 'Cable TV', percent: 25.5 },
            { label: 'Digital media', percent: 18.5 },
            { label: 'Creative & content production', percent: 13.4 },
        ],
    },
};

module.exports = { INDUSTRY_SPEND };
