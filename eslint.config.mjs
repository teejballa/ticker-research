import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // GSD agent worktrees are isolated copies of the repo; lint runs in the
    // primary worktree only.
    ".claude/**",
    // Generated Prisma artifacts.
    "prisma/generated/**",
    // Dev/debug helper scripts — not shipped, evolve outside ESLint discipline.
    "scripts/**",
  ],
}];

export default eslintConfig;
