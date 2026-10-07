import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: [
    'playwright',
    'playwright-core',
    'tesseract.js',
    'tesseract.js-core',
    'bmp-js',
    'zlibjs',
    'idb-keyval',
    'is-url',
    'node-fetch',
    'regenerator-runtime',
    'wasm-feature-detect',
  ],
  outputFileTracingIncludes: {
    '/api/commissions/upload': [
      './node_modules/tesseract.js/**/*',
      './node_modules/tesseract.js-core/**/*',
      './node_modules/bmp-js/**/*',
      './node_modules/zlibjs/**/*',
      './node_modules/idb-keyval/**/*',
      './node_modules/is-url/**/*',
      './node_modules/node-fetch/**/*',
      './node_modules/regenerator-runtime/**/*',
      './node_modules/wasm-feature-detect/**/*',
    ],
  },
};

export default nextConfig;
