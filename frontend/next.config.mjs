import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        // /_next/image is not routed to the frontend behind the root vercel.json
        // services split (it 404s), so images are served as-is.
        unoptimized: true,
        remotePatterns: [
            { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
            { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
        ],
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    // This folder is the app root (another package-lock.json higher up must not be picked).
    turbopack: {
        root: path.dirname(fileURLToPath(import.meta.url)),
    },
};

export default nextConfig;
