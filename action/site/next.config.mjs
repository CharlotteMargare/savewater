/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable static export for GitHub Pages
  output: 'export',
  // Project pages path: https://<user>.github.io/savewater
  basePath: '/savewater',
  assetPrefix: '/savewater/',
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: {
    optimizeCss: true,
  },
};

export default nextConfig;



