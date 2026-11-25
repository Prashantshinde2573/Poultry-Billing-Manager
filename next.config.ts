import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // keep screens you just visited for 30s so going back is instant (saving anything clears it)
  experimental: { staleTimes: { dynamic: 30, static: 60 } },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // never let a shared cache keep a page with business data
      // (website + sign-in pages are public and prebuilt, so they are left to the CDN)
      ...['/app/:path*', '/app', '/admin/:path*', '/admin', '/driver/:path*', '/driver', '/change-password', '/no-access', '/suspended', '/api/:path*']
        .map((source) => ({ source, headers: [{ key: 'Cache-Control', value: 'private, no-store' }] })),
      { source: '/brand/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
};

export default config;
