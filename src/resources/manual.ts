/**
 * Manual documentation resources
 * Covers user manual content: jobs, nodes, executions, calendars, etc.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { configManager } from "../config.js";
import { findMarkdownFiles, parseMarkdownContent } from "../parsers/markdown.js";
import { summarizeMarkdown, createResourceSummary, groupMarkdownFiles } from "../utils/summarizer.js";

function getDocsPath(): string {
  return configManager.getConfig().docsPath;
}

/**
 * Get manual documentation index
 */
export function getManualIndex(): string {
  const manualPath = join(getDocsPath(), "manual");
  if (!existsSync(manualPath)) {
    return "Manual documentation not found";
  }

  const files = findMarkdownFiles(manualPath);
  const sections: string[] = [];
  
  // Group files by directory/section
  const sectionsMap: Record<string, string[]> = {};
  
  for (const file of files) {
    const relativePath = file.replace(manualPath + "/", "");
    const parts = relativePath.split("/");
    const section = parts.length > 1 ? parts[0] : "root";
    
    if (!sectionsMap[section]) {
      sectionsMap[section] = [];
    }
    sectionsMap[section].push(relativePath);
  }

  sections.push("# Rundeck Manual Documentation\n");
  sections.push("Complete user manual covering jobs, nodes, executions, calendars, and more.\n");
  
  sections.push("## Available Sections\n");
  for (const [section, files] of Object.entries(sectionsMap)) {
    sections.push(`### ${section === "root" ? "Main Manual" : section}\n`);
    for (const file of files.slice(0, 20)) { // Limit to 20 files per section
      const parsed = parseMarkdownContent(readFileSync(join(manualPath, file), "utf-8"));
      sections.push(`- **${file}**: ${parsed.title}`);
    }
    if (files.length > 20) {
      sections.push(`- *... and ${files.length - 20} more files*`);
    }
  }

  sections.push("\n## Resource URIs\n");
  sections.push("- `rundeck://docs/manual` - This index");
  sections.push("- `rundeck://docs/manual/jobs` - Job documentation");
  sections.push("- `rundeck://docs/manual/nodes` - Node documentation");
  sections.push("- `rundeck://docs/manual/executions` - Execution documentation");
  sections.push("- `rundeck://docs/manual/calendars` - Calendar documentation");
  sections.push("- `rundeck://docs/manual/{section}/{topic}` - Specific topics");

  return sections.join("\n");
}

/**
 * Get specific manual topic
 */
export function getManualTopic(section: string, topic: string): string {
  const topicPath = join(getDocsPath(), "manual", section, `${topic}.md`);
  if (existsSync(topicPath)) {
    const content = readFileSync(topicPath, "utf-8");
    return summarizeMarkdown(content);
  }
  
  // Try without section (root level)
  const rootTopicPath = join(getDocsPath(), "manual", `${topic}.md`);
  if (existsSync(rootTopicPath)) {
    const content = readFileSync(rootTopicPath, "utf-8");
    return summarizeMarkdown(content);
  }
  
  return `Manual topic "${section}/${topic}" not found`;
}

/**
 * Resolve an arbitrary path under manual/ — used for nested topics that don't
 * fit the flat `{section}/{topic}.md` shape handled by getManualTopic (e.g.
 * `projects/node-execution/ssh`, where `node-execution` is itself a directory).
 * Falls back to `.md` file lookup when the path isn't a directory.
 */
export function getManualPath(parts: string[]): string {
  const relPath = parts.join("/");
  const basePath = join(getDocsPath(), "manual");
  const fullPath = join(basePath, relPath);

  if (fullPath !== basePath && !fullPath.startsWith(basePath + "/")) {
    return `Manual path "${relPath}" not found`;
  }

  if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
    const files = findMarkdownFiles(fullPath);
    const fileContents = files.map((file) => ({
      path: file.replace(fullPath + "/", ""),
      content: readFileSync(file, "utf-8"),
    }));
    return groupMarkdownFiles(fileContents);
  }

  const filePath = `${fullPath}.md`;
  if (existsSync(filePath)) {
    return summarizeMarkdown(readFileSync(filePath, "utf-8"));
  }

  return `Manual path "${relPath}" not found`;
}

/**
 * Get nodes documentation
 */
export function getNodesManual(): string {
  return getManualTopic("", "05-nodes") || getManualTopic("", "11-node-filters");
}

/**
 * Get executions documentation
 */
export function getExecutionsManual(): string {
  return getManualTopic("", "07-executions");
}

/**
 * Get AWS SSM plugin setup documentation (critical for validation)
 */
export function getAwsSsmSetup(): string {
  const ssmPath = join(getDocsPath(), "manual", "projects", "node-execution", "aws-ssm.md");
  if (existsSync(ssmPath)) {
    const content = readFileSync(ssmPath, "utf-8");
    return summarizeMarkdown(content);
  }
  
  // Also check learning/howto for cross-account SSM
  const crossAccountPath = join(getDocsPath(), "learning", "howto", "cross-account-aws-ssm.md");
  if (existsSync(crossAccountPath)) {
    const content = readFileSync(crossAccountPath, "utf-8");
    return summarizeMarkdown(content);
  }
  
  return "AWS SSM plugin documentation not found";
}

/**
 * Get performance monitoring documentation (critical for validation)
 */
export function getPerformanceMonitoring(): string {
  const sections: string[] = [];
  
  // System Report
  const systemReportPath = join(getDocsPath(), "manual", "system-report.md");
  if (existsSync(systemReportPath)) {
    sections.push("## System Report\n");
    sections.push(readFileSync(systemReportPath, "utf-8"));
    sections.push("\n");
  }
  
  // Metrics API
  const apiIndexPath = join(getDocsPath(), "api", "index.md");
  if (existsSync(apiIndexPath)) {
    const apiContent = readFileSync(apiIndexPath, "utf-8");
    const metricsMatch = apiContent.match(/## Metrics[\s\S]*?(?=##|$)/);
    if (metricsMatch) {
      sections.push("## Metrics API\n");
      sections.push(metricsMatch[0]);
      sections.push("\n");
    }
  }
  
  // Prometheus/Grafana monitoring
  const exporterPath = join(getDocsPath(), "learning", "howto", "rundeck-exporter.md");
  if (existsSync(exporterPath)) {
    sections.push("## Prometheus and Grafana Monitoring\n");
    sections.push(readFileSync(exporterPath, "utf-8"));
  }
  
  if (sections.length === 0) {
    return "Performance monitoring documentation not found";
  }
  
  return sections.join("\n---\n\n");
}

