import js from "@eslint/js";
import tseslint from "typescript-eslint";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
    { ignores: ["dist", "node_modules"] },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    // 🟢 Type-aware linting ONLY for src folder
    {
        files: ["src/**/*.ts", "src/**/*.tsx"],
        languageOptions: {
            parserOptions: {
                project: path.join(__dirname, "tsconfig.json"),
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["warn"],
            // Prevent services from importing models directly
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["**/models/*"],
                            message: "Services must not import models directly. Use CRUD modules instead.",
                        },
                    ],
                },
            ],
        },
    },

    // 🟡 Non type-aware linting for root TS files (scripts, configs, seeds)
    {
        files: ["*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },

    // 🧪 Relax rules for test files
    {
        files: ["**/*.test.ts", "**/__tests__/**/*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/ban-ts-comment": "off",
        },
    },

    // ⚙ Allow CommonJS in config files
    {
        files: ["*.js"],
        languageOptions: {
            sourceType: "commonjs",
        },
    },
];
