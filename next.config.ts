import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'tesseract.js',
    'tesseract.js-core',
  ],
  outputFileTracingIncludes: {
    '/api/commissions/upload': [
      './node_modules/tesseract.js/**/*',
      './node_modules/tesseract.js-core/**/*',
    ],
  },
};

export default nextConfig;
