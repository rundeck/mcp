#!/usr/bin/env node
/**
 * Downloads Rundeck documentation from GitHub into docs/ so the MCP server
 * can serve it without requiring RUNDECK_DOCS_PATH to be configured manually.
 *
 * Skipped when:
 *   - RUNDECK_DOCS_PATH is explicitly set (user manages docs themselves)
 *   - docs/ already exists at the expected location
 *   - SKIP_RUNDECK_DOCS_DOWNLOAD=1 is set
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const DOCS_REPO = "https://github.com/rundeck/docs";
const DOCS_BRANCH = process.env.RUNDECK_DOCS_BRANCH || "4.0.x";
const TARBALL_URL = `${DOCS_REPO}/archive/refs/heads/${DOCS_BRANCH}.tar.gz`;
const DOCS_DEST = join(rootDir, "docs");

function log(msg) {
  console.log(`[rundeck-mcp] ${msg}`);
}

function warn(msg) {
  console.warn(`[rundeck-mcp] WARNING: ${msg}`);
}

// --- Skip conditions ---

if (process.env.SKIP_RUNDECK_DOCS_DOWNLOAD === "1") {
  log("SKIP_RUNDECK_DOCS_DOWNLOAD is set, skipping.");
  process.exit(0);
}

if (process.env.RUNDECK_DOCS_PATH) {
  log("RUNDECK_DOCS_PATH is set, skipping automatic download.");
  process.exit(0);
}

const force = process.argv.includes("--force");

if (!force && existsSync(DOCS_DEST)) {
  log(`Docs already present at ${DOCS_DEST}, skipping download.`);
  log("To re-download run: npm run docs:update");
  process.exit(0);
}

if (force && existsSync(DOCS_DEST)) {
  log("--force: removing existing docs...");
  rmSync(DOCS_DEST, { recursive: true, force: true });
}

// --- Download ---

log(`Downloading Rundeck docs (branch: ${DOCS_BRANCH})...`);
log(`Source: ${TARBALL_URL}`);

mkdirSync(DOCS_DEST, { recursive: true });

try {
  // curl: follow redirects (-L), fail on HTTP errors (-f), silent progress (-sS shows errors only)
  // tar: strip the top-level directory from the archive (--strip-components=1)
  execSync(
    `curl -fsSL "${TARBALL_URL}" | tar xz --strip-components=1 -C "${DOCS_DEST}"`,
    { stdio: ["ignore", "inherit", "inherit"] }
  );
  log(`Documentation downloaded to ${DOCS_DEST}`);
} catch (err) {
  // Clean up empty dir so next install retries
  try { rmSync(DOCS_DEST, { recursive: true, force: true }); } catch {}

  warn("Could not download Rundeck documentation.");
  warn(`  Branch tried : ${DOCS_BRANCH}`);
  warn(`  To change it : set RUNDECK_DOCS_BRANCH before running npm install`);
  warn(`  To skip      : set SKIP_RUNDECK_DOCS_DOWNLOAD=1`);
  warn(`  Manual setup : set RUNDECK_DOCS_PATH to your local docs directory`);
  // Exit 0 — don't fail the install, docs are optional
  process.exit(0);
}