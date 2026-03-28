import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker/ECS deployment — bundles server + dependencies
  output: "standalone",

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Prevent sensitive data exposure
  serverExternalPackages: ["bcryptjs", "otplib"],

  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },

  webpack: (config, { nextRuntime }) => {
    // next-auth v5 / jose v5 reference CompressionStream/DecompressionStream which
    // are not available in all Edge Runtime environments. Stub them out so the
    // middleware bundle doesn't fail static analysis at build time.
    if (nextRuntime === "edge") {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "node:stream/web": false,
      };
    }
    return config;
  },
};

export default nextConfig;
