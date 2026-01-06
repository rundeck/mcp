/**
 * RD CLI documentation resources
 * Covers command-line tool usage and scripting
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { configManager } from "../config.js";
import { findMarkdownFiles, parseMarkdownContent } from "../parsers/markdown.js";
import { summarizeMarkdown, groupMarkdownFiles } from "../utils/summarizer.js";

function getDocsPath(): string {
  return configManager.getConfig().docsPath;
}

/**
 * Get RD CLI documentation index
 */
export function getRdCliIndex(): string {
  const rdCliPath = join(getDocsPath(), "rd-cli");
  if (!existsSync(rdCliPath)) {
    return "RD CLI documentation not found";
  }

  const files = findMarkdownFiles(rdCliPath);
  const sections: string[] = [];
  
  sections.push("# Rundeck RD CLI Documentation\n");
  sections.push("Complete guide to the Rundeck command-line interface tool.\n");
  
  // List main topics
  const topics = [
    "install",
    "commands",
    "configuration",
    "scripting",
    "extensions",
    "ssl",
    "rd-acl",
  ];
  
  sections.push("## Main Topics\n");
  for (const topic of topics) {
    const topicFile = files.find(f => f.includes(topic));
    if (topicFile) {
      const parsed = parseMarkdownContent(readFileSync(topicFile, "utf-8"));
      sections.push(`- **${topic}**: ${parsed.title}`);
    }
  }
  
  sections.push("\n## Resource URIs\n");
  sections.push("- `rundeck://docs/rd-cli` - This index");
  sections.push("- `rundeck://docs/rd-cli/{topic}` - Specific RD CLI topics");
  sections.push("- `rundeck://docs/rd-cli/commands` - Command reference");
  sections.push("- `rundeck://docs/rd-cli/scripting` - Scripting guide");

  return sections.join("\n");
}

/**
 * Get RD CLI topic documentation
 */
export function getRdCliTopic(topic: string): string {
  const topicPath = join(getDocsPath(), "rd-cli", `${topic}.md`);
  if (existsSync(topicPath)) {
    const content = readFileSync(topicPath, "utf-8");
    return summarizeMarkdown(content);
  }
  
  // Try index.md if topic is "index"
  if (topic === "index") {
    return getRdCliIndex();
  }
  
  return `RD CLI topic "${topic}" not found`;
}

/**
 * Get RD CLI commands documentation
 */
export function getRdCliCommands(): string {
  return getRdCliTopic("commands");
}

/**
 * Get RD CLI scripting documentation
 */
export function getRdCliScripting(): string {
  return getRdCliTopic("scripting");
}

