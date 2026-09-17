// Backward-compatible entry point. The typed parser is shared with the import API.
import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/extract-apac-source.ts"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
