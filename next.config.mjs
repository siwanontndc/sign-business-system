/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/line/webhook", destination: "/api/line/webhook-v3" },
        {
          source: "/quotations/new",
          has: [{ type: "query", key: "survey", value: "(?<survey>.*)" }],
          destination: "/surveys/:survey/quotation",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
