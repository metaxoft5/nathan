import type { NextConfig } from "next";

const API_PROXY_TARGET = process.env.NEXT_PUBLIC_API_URL;

const nextConfig: NextConfig = {
  async rewrites() {
    // If API target is missing, skip rewrites to avoid build errors.
    if (!API_PROXY_TARGET) {
      console.warn("NEXT_PUBLIC_API_URL is not set; skipping proxy rewrites.");
      return [];
    }
    return [
      {
        source: "/auth/:path*",
        destination: `${API_PROXY_TARGET}/auth/:path*`,
      },
      { source: "/api/products", destination: `${API_PROXY_TARGET}/products` },
      {
        source: "/api/products/:path*",
        destination: `${API_PROXY_TARGET}/products/:path*`,
      },
      { source: "/cart", destination: `${API_PROXY_TARGET}/cart` },
      {
        source: "/cart/:path*",
        destination: `${API_PROXY_TARGET}/cart/:path*`,
      },
      { source: "/orders", destination: `${API_PROXY_TARGET}/orders` },
      {
        source: "/orders/:path*",
        destination: `${API_PROXY_TARGET}/orders/:path*`,
      },
      { source: "/payments", destination: `${API_PROXY_TARGET}/payments` },
      {
        source: "/payments/:path*",
        destination: `${API_PROXY_TARGET}/payments/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${API_PROXY_TARGET}/uploads/:path*`,
      },
    ];
  },
  // Image configuration for external domains
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'licorice4good.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'api.licorice4good.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Production optimizations
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  // CORS is handled by the backend API, no need for frontend CORS headers
};

export default nextConfig;
