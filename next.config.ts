import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async rewrites() {
        return [
            {
                // Pretty Webcal subscription URL -> Pages Router handler
                source: "/api/calendar/:studentId.ics",
                destination: "/api/calendar/:studentId",
            },
        ];
    },
};

export default nextConfig;
