import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 啟用 Next.js 16.3+ Cache Components（PPR 靜態外殼 + Suspense 串流）與 Partial Prefetching
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
