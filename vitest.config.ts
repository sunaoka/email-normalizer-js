import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcovonly"],
      include: ["src/index.ts"],
    },
  },
});
