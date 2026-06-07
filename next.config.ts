import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Prevent the Router Cache from serving stale dynamic pages (e.g. profile
    // showing old picks after a vote). Dynamic routes that use cookies/headers
    // are always re-fetched from the server on navigation.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
