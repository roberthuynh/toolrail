import { defineConfig } from "tsup";

const shared = {
  format: ["esm", "cjs"] as const,
  dts: true,
  sourcemap: true,
  treeshake: false,
  splitting: false,
  clean: false,
  target: "es2022",
  external: ["react", "react-dom", "react/jsx-runtime"],
};

// Two configs so only the React entry carries the "use client" directive. `dist` is cleaned by the build script.
export default defineConfig([
  { ...shared, entry: { index: "src/index.ts" } },
  { ...shared, entry: { "react/index": "src/react/index.ts" }, banner: { js: '"use client";' } },
]);
