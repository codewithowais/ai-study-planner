/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produce a self-contained server build for the Docker image.
  output: "standalone",
  // pdfjs-dist is only used in server code (API routes / lib); keep it external
  // so Next doesn't try to bundle its worker for the browser.
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist"],
  },
};

export default nextConfig;
