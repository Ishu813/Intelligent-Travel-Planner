/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@trip-planner/api"],
  env: {
    // NextAuth reads NEXTAUTH_URL in client bundles; without this it defaults to localhost:3000.
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  },
};

export default nextConfig;

