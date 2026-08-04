/**
 * Learning resources documentation
 */

import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { configManager } from "../config.js";
import { findMarkdownFiles } from "../parsers/markdown.js";
import { groupMarkdownFiles } from "../utils/summarizer.js";

function getDocsPath(): string {
  return configManager.getConfig().docsPath;
}

/**
 * Get getting started guide
 */
export function getGettingStarted(): string {
  const gettingStartedPath = join(
    getDocsPath(),
    "learning",
    "getting-started",
    "index.md"
  );
  if (existsSync(gettingStartedPath)) {
    const content = readFileSync(gettingStartedPath, "utf-8");
    return content;
  }

  const manualPath = join(getDocsPath(), "manual", "03-getting-started.md");
  if (existsSync(manualPath)) {
    return readFileSync(manualPath, "utf-8");
  }

  return "Getting started guide not found";
}

/**
 * Get runners overview (important for validation)
 */
export function getRunnersOverview(): string {
  const runnersPath = join(
    getDocsPath(),
    "learning",
    "getting-started",
    "runners-overview.md"
  );
  if (existsSync(runnersPath)) {
    return readFileSync(runnersPath, "utf-8");
  }
  return "Runners overview not found";
}

/**
 * Get how-to guide by topic. `topic` may be a nested path (e.g.
 * "acls/group-readonly") since howto guides can live in subdirectories.
 */
export function getHowTo(topic: string): string {
  const basePath = join(getDocsPath(), "learning", "howto");
  const fullPath = join(basePath, topic);

  // Guard against path traversal: `topic` can come straight from a client's
  // requested URI, so a crafted "../../../etc/passwd"-style value must not
  // resolve outside the howto directory (mirrors getManualPath's check).
  if (fullPath !== basePath && !fullPath.startsWith(basePath + "/")) {
    return `How-to guide "${topic}" not found`;
  }

  if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
    const files = findMarkdownFiles(fullPath);
    const fileContents = files.map((file) => ({
      path: file.replace(fullPath + "/", ""),
      content: readFileSync(file, "utf-8"),
    }));
    return groupMarkdownFiles(fileContents);
  }

  const howToPath = `${fullPath}.md`;
  if (existsSync(howToPath)) {
    return readFileSync(howToPath, "utf-8");
  }

  // Try with different naming conventions
  const altPaths = [
    `${fullPath.replace(/-/g, "_")}.md`,
    `${fullPath.replace(/_/g, "-")}.md`,
  ];

  for (const altPath of altPaths) {
    if (existsSync(altPath)) {
      return readFileSync(altPath, "utf-8");
    }
  }

  // List available how-to guides
  const indexPath = join(basePath, "index.md");
  if (existsSync(indexPath)) {
    const indexContent = readFileSync(indexPath, "utf-8");
    return `How-to guide "${topic}" not found. Available guides:\n\n${indexContent}`;
  }

  return `How-to guide "${topic}" not found`;
}

/**
 * Get tutorial lesson. `lesson` may be a nested path since tutorial content
 * can live in subdirectories.
 */
export function getTutorial(lesson: string): string {
  const basePath = join(getDocsPath(), "learning", "tutorial");
  const fullPath = join(basePath, lesson);

  // Guard against path traversal — see getHowTo for rationale.
  if (fullPath !== basePath && !fullPath.startsWith(basePath + "/")) {
    return `Tutorial "${lesson}" not found`;
  }

  if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
    const files = findMarkdownFiles(fullPath);
    const fileContents = files.map((file) => ({
      path: file.replace(fullPath + "/", ""),
      content: readFileSync(file, "utf-8"),
    }));
    return groupMarkdownFiles(fileContents);
  }

  const tutorialPath = `${fullPath}.md`;
  if (existsSync(tutorialPath)) {
    return readFileSync(tutorialPath, "utf-8");
  }

  // Try index
  const indexPath = join(basePath, "index.md");
  if (existsSync(indexPath)) {
    const indexContent = readFileSync(indexPath, "utf-8");
    return `Tutorial "${lesson}" not found. Available tutorials:\n\n${indexContent}`;
  }

  return `Tutorial "${lesson}" not found`;
}

