// ESLint flat config for epochcloud-sveltekit (SvelteKit 5 + TS)
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/.svelte-kit/**",
      "**/build/**",
      "**/dist/**",
      "**/node_modules/**",
    ],
  },

  // Base JS rules with env-like globals for both browser and modern Node
  {
    ...js.configs.recommended,
    languageOptions: {
      globals: {
        fetch: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        process: "readonly",
        Buffer: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        URLSearchParams: "readonly",
        performance: "readonly",
        window: "readonly",
        document: "readonly",
        // Build metadata constants injected by Vite `define` (see vite.config.ts).
        __APP_VERSION__: "readonly",
        __APP_COMMIT__: "readonly",
        __APP_BUILD_TIME__: "readonly",
      },
    },
  },

  // Svelte rules and parser for .svelte files
  ...svelte.configs["flat/recommended"],

  // Ensure TypeScript in <script lang="ts"> inside Svelte is parsed correctly
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": "off",
    },
  },

  // TypeScript without type-checking (no tsconfig required)
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: false,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
      "@typescript-eslint/no-explicit-any": "off",
      "no-unused-vars": "off",
    },
  },

  // Project-wide stylistic rules
  {
    files: ["**/*.{ts,tsx,js,svelte}"],
    rules: {
      "semi": ["error", "always"],
    },
  },
];
