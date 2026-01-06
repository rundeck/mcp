/**
 * Configuration documentation resources
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { configManager } from "../config.js";

function getDocsPath(): string {
  return configManager.getConfig().docsPath;
}

/**
 * Get system configuration documentation
 */
export function getSystemConfig(): string {
  const configPath = join(
    getDocsPath(),
    "administration",
    "configuration",
    "config-file-reference.md"
  );
  if (existsSync(configPath)) {
    return readFileSync(configPath, "utf-8");
  }

  const indexPath = join(getDocsPath(), "administration", "configuration", "index.md");
  if (existsSync(indexPath)) {
    return readFileSync(indexPath, "utf-8");
  }

  return "System configuration documentation not found";
}

/**
 * Get project configuration documentation
 */
export function getProjectConfig(): string {
  const projectPath = join(getDocsPath(), "manual", "projects", "configuration.md");
  if (existsSync(projectPath)) {
    return readFileSync(projectPath, "utf-8");
  }

  const settingsPath = join(getDocsPath(), "manual", "project-settings.md");
  if (existsSync(settingsPath)) {
    return readFileSync(settingsPath, "utf-8");
  }

  return "Project configuration documentation not found";
}

/**
 * Get plugin configuration documentation
 */
export function getPluginConfig(): string {
  const pluginPath = join(
    getDocsPath(),
    "administration",
    "configuration",
    "plugins",
    "configuring.md"
  );
  if (existsSync(pluginPath)) {
    return readFileSync(pluginPath, "utf-8");
  }

  const pluginsIndexPath = join(getDocsPath(), "manual", "plugins", "index.md");
  if (existsSync(pluginsIndexPath)) {
    return readFileSync(pluginsIndexPath, "utf-8");
  }

  return "Plugin configuration documentation not found";
}

/**
 * Get configuration examples by type
 */
export function getConfigExamples(type?: string): string {
  // Try to find examples in configuration directory
  const examplesPath = join(
    getDocsPath(),
    "administration",
    "configuration",
    "config-file-reference.md"
  );
  if (existsSync(examplesPath)) {
    const content = readFileSync(examplesPath, "utf-8");
    if (type) {
      // Try to extract section for specific type
      const typeSection = content.split(new RegExp(`##\\s+${type}`, "i"));
      if (typeSection.length > 1) {
        return typeSection[1].split("\n## ")[0];
      }
    }
    return content;
  }

  return "Configuration examples not found";
}

