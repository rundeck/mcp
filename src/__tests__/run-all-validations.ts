#!/usr/bin/env node
/**
 * Runs all validation scripts
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const validations = [
  "browser-validation.js",
  "tools-validation.js",
  "mcp-inspector-validation.js",
  "subagent-validation.js",
];

async function runValidation(script: string): Promise<boolean> {
  return new Promise((resolve) => {
    const scriptPath = join(__dirname, script);
    const proc = spawn("node", [scriptPath], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    proc.on("exit", (code) => {
      resolve(code === 0);
    });
  });
}

async function main() {
  console.log("Running all validations...\n");

  for (const validation of validations) {
    const success = await runValidation(validation);
    if (!success) {
      console.error(`\n❌ Validation failed: ${validation}`);
      process.exit(1);
    }
  }

  console.log("\n✅ All validations passed!");
}

main();
