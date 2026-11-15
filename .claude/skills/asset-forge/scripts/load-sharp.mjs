// Loads `sharp` from the project's node_modules (the skill itself has no dependencies).
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function loadSharp() {
  const starts = [process.env.CLAUDE_PROJECT_DIR, process.cwd(), resolve(dirname(fileURLToPath(import.meta.url)), "../../../..")];
  for (const s of starts.filter(Boolean)) {
    let dir = resolve(s);
    for (let i = 0; i < 6; i++) {
      if (existsSync(join(dir, "node_modules", "sharp"))) return createRequire(join(dir, "package.json"))("sharp");
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  console.error("sharp not found in the project's node_modules. Fall back to the chrome-devtools route in references/verify.md.");
  process.exit(2);
}
