/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are stable in 14, kept explicit for clarity.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
