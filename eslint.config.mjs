import { config } from "@repo/eslint-config/base";

const files = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs"];

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
          plugins: [
            "@babel/plugin-syntax-jsx",
            ["@babel/plugin-syntax-decorators", { version: "legacy" }],
          ],
        },
      },
    },
  },
  {
    files,
    rules: {
      "no-unused-vars": "off",
    },
  },
];
