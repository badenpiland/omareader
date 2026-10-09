import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/**", "vendor/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    files: ["scripts/**/*.js", "scripts/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
];
