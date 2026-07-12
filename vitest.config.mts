import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Pure logic under test needs no DOM; keep the default fast node runtime.
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Report only on the logic we deliberately cover, not the whole app —
      // routes/components/UI are out of scope for this unit suite.
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "**/*.d.ts"],
      reporter: ["text", "html"],
    },
  },
});
