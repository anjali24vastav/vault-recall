import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                project: "./tsconfig.json",
            },
        },
        plugins: {
            obsidianmd,
        },
        rules: {
            "obsidianmd/ui/sentence-case": ["warn", { allowAutoFix: true }],
            "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
            "obsidianmd/settings-tab/no-manual-html-headings": "error",
        },
    },
];
