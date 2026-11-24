import { config } from "@repo/eslint-config/react-internal";

const files = ["**/*.ts", "**/*.tsx"];

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config.map((entry) =>
    Object.keys(entry).length === 1 && "ignores" in entry
      ? entry
      : { ...entry, files },
  ),
  {
    files,
    languageOptions: {
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript"],
          plugins: ["@babel/plugin-syntax-jsx"],
        },
      },
    },
  },
  {
    files,
    rules: {
      // TypeScript's checker resolves identifiers, types and globals; the
      // Babel parser cannot, so ESLint's JS-only rule reports false positives.
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];
