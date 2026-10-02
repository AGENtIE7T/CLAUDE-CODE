/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prompts are read from disk at runtime; make sure Vercel bundles them with the API routes.
  outputFileTracingIncludes: {
    "/api/**": ["./lib/prompts/**/*", "./lib/niches.json"],
  },
};

export default nextConfig;
