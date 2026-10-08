import type { NextConfig } from "next";
import path from "node:path";

import dotenv from "dotenv";
dotenv.config({ path: "./env/local.env" });

const nextConfig: NextConfig = {
  // Hide the on-screen dev indicator ("N · Issue" chip). Dev-only; never shipped.
  devIndicators: false,
  // Allow the dev server's JS/HMR/font assets to load when the app is served
  // through an ngrok tunnel (otherwise only the static shell renders). Dev-only.
  allowedDevOrigins: ["untrimmed-diocese-rising.ngrok-free.dev", ".ngrok-free.dev", ".ngrok-free.app"],
  // Pin the workspace root to this app (avoids picking up a parent lockfile).
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // The app starts at the portal login — send the root straight there.
  async redirects() {
    return [
      {
        source: "/",
        destination: "/portal/login",
        permanent: false,
      },
    ];
  },
  // Proxy API calls to the local FastAPI backend so the app works through a
  // single origin (e.g. an ngrok tunnel) with no CORS. Pair with
  // NEXT_PUBLIC_API_URL=/api so the browser hits this same host.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8009/api/:path*",
      },
    ];
  },
};

export default nextConfig;
