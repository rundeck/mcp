/**
 * Learning resources documentation
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { configManager } from "../config.js";

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
 * Get how-to guide by topic
 */
export function getHowTo(topic: string): string {
  const howToPath = join(getDocsPath(), "learning", "howto", `${topic}.md`);
  if (existsSync(howToPath)) {
    return readFileSync(howToPath, "utf-8");
  }

  // Try with different naming conventions
  const altPaths = [
    join(getDocsPath(), "learning", "howto", `${topic.replace(/-/g, "_")}.md`),
    join(getDocsPath(), "learning", "howto", `${topic.replace(/_/g, "-")}.md`),
  ];

  for (const altPath of altPaths) {
    if (existsSync(altPath)) {
      return readFileSync(altPath, "utf-8");
    }
  }

  // List available how-to guides
  const indexPath = join(getDocsPath(), "learning", "howto", "index.md");
  if (existsSync(indexPath)) {
    const indexContent = readFileSync(indexPath, "utf-8");
    return `How-to guide "${topic}" not found. Available guides:\n\n${indexContent}`;
  }

  return `How-to guide "${topic}" not found`;
}

/**
 * Get tutorial lesson
 */
export function getTutorial(lesson: string): string {
  const tutorialPath = join(getDocsPath(), "learning", "tutorial", `${lesson}.md`);
  if (existsSync(tutorialPath)) {
    return readFileSync(tutorialPath, "utf-8");
  }

  // Try index
  const indexPath = join(getDocsPath(), "learning", "tutorial", "index.md");
  if (existsSync(indexPath)) {
    const indexContent = readFileSync(indexPath, "utf-8");
    return `Tutorial "${lesson}" not found. Available tutorials:\n\n${indexContent}`;
  }

  return `Tutorial "${lesson}" not found`;
}

