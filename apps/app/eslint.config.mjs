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
      "no-unused-vars": "off",
    },
  },
];
