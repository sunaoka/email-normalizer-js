import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  tseslint.configs.strict,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylistic,
  tseslint.configs.stylisticTypeChecked,
  {
    ignores: ["coverage/**", "dist/**"],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.ts",
            "tests/normalize.test.ts",
            "vitest.config.ts",
          ],
        },
      },
    },
  },
);
