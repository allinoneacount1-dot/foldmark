import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Test configuration.
 *
 * `node` environment, not jsdom: what is under test here is the reasoning
 * layer — reconciliation, persistence eligibility, unit safety, cursor
 * completeness — not the rendering of components. Those rules are where a
 * mistake becomes a wrong number shown to someone as fact, so those are what
 * the suite protects.
 *
 * Nothing in the suite reaches the network or a database. A test that needs a
 * provider gets a fixture recorded from the real response; a test that needs
 * storage gets an in-memory double. A suite that only passes when a third party
 * is up is not testing this repository.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/server/**", "src/config/**"],
      reporter: ["text-summary"],
    },
  },
});
