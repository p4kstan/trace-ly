import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "supabase/functions/**/*.{test,spec}.ts",
    ],
    exclude: [
      "node_modules/**",
      // edge-auth.test.ts uses Deno std imports; runs under deno test, not vitest.
      "supabase/functions/_shared/edge-auth.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Allow Deno-style explicit `.ts` imports inside supabase/functions
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
});
