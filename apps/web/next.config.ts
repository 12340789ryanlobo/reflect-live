import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // The 'Activity' tab (/dashboard/fitness) was merged into
      // /dashboard/competitions. Keep the old URL working for any
      // bookmarks / shared links. Permanent (308) since it's a
      // structural move, not an A/B.
      { source: '/dashboard/fitness', destination: '/dashboard/competitions', permanent: true },
    ];
  },
};

export default config;
