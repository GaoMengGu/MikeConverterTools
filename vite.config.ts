import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    include: [
      "dxf-parser",
      "rbush",
      "robust-point-in-polygon",
      "robust-predicates",
    ],
  },
  build: { target: "es2022" },
  test: { include: ["tests/**/*.test.ts"] },
});
