/**
 * Developer documentation resources
 * Covers plugin development, API usage, and development guides
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
 * Get developer documentation index
 */
export function getDeveloperIndex(): string {
  const devPath = join(getDocsPath(), "developer");
  if (!existsSync(devPath)) {
    return "Developer documentation not found";
  }

  const files = findMarkdownFiles(devPath);
  const sections: string[] = [];
  
  sections.push("# Rundeck Developer Documentation\n");
  sections.push("Complete developer guide covering plugin development, API usage, and integration.\n");
  
  // List plugin types
  const pluginTypes = [
    "step-plugins",
    "node-execution-plugins",
    "file-copier-plugins",
    "notification-plugins",
    "storage-plugin",
    "orchestrator-plugin",
    "scm-plugins",
    "ui-plugins",
    "option-values-plugins",
    "file-upload-plugins",
  ];
  
  sections.push("## Plugin Development\n");
  sections.push("Rundeck supports various plugin types:\n");
  for (const pluginType of pluginTypes) {
    const pluginFile = files.find(f => f.includes(pluginType) || f.includes(pluginType.replace("-", "_")));
    if (pluginFile) {
      const parsed = parseMarkdownContent(readFileSync(pluginFile, "utf-8"));
      sections.push(`- **${pluginType}**: ${parsed.title}`);
    }
  }
  
  sections.push("\n## Resource URIs\n");
  sections.push("- `rundeck://docs/developer` - This index");
  sections.push("- `rundeck://docs/developer/plugins` - Plugin development overview");
  sections.push("- `rundeck://docs/developer/plugin/{type}` - Specific plugin type documentation");
  sections.push("- `rundeck://docs/developer/{topic}` - Other developer topics");

  return sections.join("\n");
}

/**
 * Get plugin development documentation
 */
export function getPluginDevelopmentDocs(): string {
  const devPath = join(getDocsPath(), "developer");
  if (!existsSync(devPath)) {
    return "Developer documentation not found";
  }

  const files = findMarkdownFiles(devPath);
  // Filter plugin-related files
  const pluginFiles = files.filter(f => 
    f.includes("plugin") || 
    f.includes("step") || 
    f.includes("node-execution") ||
    f.includes("file-copier") ||
    f.includes("notification")
  );
  
  const fileContents = pluginFiles.map(file => ({
    path: file.replace(devPath + "/", ""),
    content: readFileSync(file, "utf-8")
  }));
  
  return groupMarkdownFiles(fileContents);
}

/**
 * Get specific plugin type documentation
 */
export function getPluginTypeDocs(pluginType: string): string {
  const devPath = join(getDocsPath(), "developer");
  const files = findMarkdownFiles(devPath);
  
  // Find files matching plugin type
  const matchingFiles = files.filter(f => 
    f.toLowerCase().includes(pluginType.toLowerCase()) ||
    f.toLowerCase().includes(pluginType.toLowerCase().replace("-", "_"))
  );
  
  if (matchingFiles.length === 0) {
    return `Plugin type "${pluginType}" documentation not found`;
  }
  
  const fileContents = matchingFiles.map(file => ({
    path: file.replace(devPath + "/", ""),
    content: readFileSync(file, "utf-8")
  }));
  
  return groupMarkdownFiles(fileContents);
}

/**
 * Get specific developer topic
 */
export function getDeveloperTopic(topic: string): string {
  const topicPath = join(getDocsPath(), "developer", `${topic}.md`);
  if (existsSync(topicPath)) {
    const content = readFileSync(topicPath, "utf-8");
    return summarizeMarkdown(content);
  }
  
  return `Developer topic "${topic}" not found`;
}

