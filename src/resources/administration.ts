/**
 * Administration documentation resources
 * Covers cluster setup, configuration, security, installation, etc.
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
 * Get administration documentation index
 */
export function getAdministrationIndex(): string {
  const adminPath = join(getDocsPath(), "administration");
  if (!existsSync(adminPath)) {
    return "Administration documentation not found";
  }

  const files = findMarkdownFiles(adminPath);
  const sections: string[] = [];
  
  // Group by main categories
  const categories = ["cluster", "configuration", "install", "security", "key-storage", "runner", "maintenance"];
  
  sections.push("# Rundeck Administration Documentation\n");
  sections.push("Complete administration guide covering installation, configuration, clustering, security, and operations.\n");
  
  sections.push("## Main Categories\n");
  for (const category of categories) {
    const categoryPath = join(adminPath, category);
    if (existsSync(categoryPath)) {
      const categoryFiles = findMarkdownFiles(categoryPath);
      sections.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)} (${categoryFiles.length} files)`);
      sections.push(`- Use \`rundeck://docs/administration/${category}\` for detailed documentation`);
    }
  }
  
  sections.push("\n## Resource URIs\n");
  sections.push("- `rundeck://docs/administration` - This index");
  sections.push("- `rundeck://docs/administration/cluster` - Cluster setup and management");
  sections.push("- `rundeck://docs/administration/configuration` - System configuration");
  sections.push("- `rundeck://docs/administration/install` - Installation guides");
  sections.push("- `rundeck://docs/administration/security` - Security configuration");
  sections.push("- `rundeck://docs/administration/runner` - Runner documentation");
  sections.push("- `rundeck://docs/administration/{category}/{topic}` - Specific topics");

  return sections.join("\n");
}

/**
 * Get administration category documentation
 */
export function getAdministrationCategory(category: string): string {
  const categoryPath = join(getDocsPath(), "administration", category);
  
  if (existsSync(categoryPath)) {
    const files = findMarkdownFiles(categoryPath);
    const fileContents = files.map(file => ({
      path: file.replace(categoryPath + "/", ""),
      content: readFileSync(file, "utf-8")
    }));
    
    return groupMarkdownFiles(fileContents);
  }
  
  return `Administration category "${category}" not found`;
}

/**
 * Get specific administration topic
 */
export function getAdministrationTopic(category: string, topic: string): string {
  const topicPath = join(getDocsPath(), "administration", category, `${topic}.md`);
  if (existsSync(topicPath)) {
    const content = readFileSync(topicPath, "utf-8");
    return summarizeMarkdown(content);
  }
  
  // Try without category (root level)
  const rootTopicPath = join(getDocsPath(), "administration", `${topic}.md`);
  if (existsSync(rootTopicPath)) {
    const content = readFileSync(rootTopicPath, "utf-8");
    return summarizeMarkdown(content);
  }
  
  return `Administration topic "${category}/${topic}" not found`;
}

/**
 * Get cluster documentation
 */
export function getClusterDocs(): string {
  return getAdministrationCategory("cluster");
}

/**
 * Get configuration documentation
 */
export function getConfigurationDocs(): string {
  return getAdministrationCategory("configuration");
}

/**
 * Get installation documentation
 */
export function getInstallationDocs(): string {
  return getAdministrationCategory("install");
}

/**
 * Get security documentation
 */
export function getSecurityDocs(): string {
  return getAdministrationCategory("security");
}

/**
 * Get runner documentation
 */
export function getRunnerDocs(): string {
  return getAdministrationCategory("runner");
}

