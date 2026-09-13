/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/line/webhook", destination: "/api/line/webhook-v2" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
