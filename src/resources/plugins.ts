/**
 * Plugin documentation resources
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { configManager } from "../config.js";

function getDocsPath(): string {
  return configManager.getConfig().docsPath;
}

/**
 * Get plugin overview
 */
export function getPluginOverview(): string {
  const pluginsPath = join(getDocsPath(), "manual", "plugins", "index.md");
  if (existsSync(pluginsPath)) {
    return readFileSync(pluginsPath, "utf-8");
  }

  const developerPath = join(getDocsPath(), "developer", "index.md");
  if (existsSync(developerPath)) {
    return readFileSync(developerPath, "utf-8");
  }

  return "Plugin overview not found";
}

/**
 * Get specific plugin documentation
 */
export function getPlugin(type: string, name: string): string {
  // Try node-steps first
  const nodeStepPath = join(
    getDocsPath(),
    "manual",
    "jobs",
    "job-plugins",
    "node-steps",
    `${name}.md`
  );
  if (existsSync(nodeStepPath)) {
    return readFileSync(nodeStepPath, "utf-8");
  }

  // Try workflow-steps
  const workflowStepPath = join(
    getDocsPath(),
    "manual",
    "jobs",
    "job-plugins",
    "workflow-steps",
    `${name}.md`
  );
  if (existsSync(workflowStepPath)) {
    return readFileSync(workflowStepPath, "utf-8");
  }

  // Try developer plugins
  const developerPath = join(getDocsPath(), "developer", `${name}.md`);
  if (existsSync(developerPath)) {
    return readFileSync(developerPath, "utf-8");
  }

  return `Plugin documentation for ${type}/${name} not found`;
}

/**
 * Get node step plugins list
 */
export function getNodeStepPlugins(): string {
  const builtinPath = join(
    getDocsPath(),
    "manual",
    "jobs",
    "job-plugins",
    "node-steps",
    "builtin.md"
  );
  if (existsSync(builtinPath)) {
    return readFileSync(builtinPath, "utf-8");
  }

  const indexPath = join(getDocsPath(), "manual", "jobs", "job-plugins", "index.md");
  if (existsSync(indexPath)) {
    return readFileSync(indexPath, "utf-8");
  }

  return "Node step plugins documentation not found";
}

/**
 * Get workflow step plugins list
 */
export function getWorkflowStepPlugins(): string {
  const builtinPath = join(
    getDocsPath(),
    "manual",
    "jobs",
    "job-plugins",
    "workflow-steps",
    "builtin.md"
  );
  if (existsSync(builtinPath)) {
    return readFileSync(builtinPath, "utf-8");
  }

  const indexPath = join(getDocsPath(), "manual", "jobs", "job-plugins", "index.md");
  if (existsSync(indexPath)) {
    return readFileSync(indexPath, "utf-8");
  }

  return "Workflow step plugins documentation not found";
}

