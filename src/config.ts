/**
 * Configuration management for the MCP server
 */

import { existsSync, realpathSync } from "fs";
import { join, resolve } from "path";
import { logger } from "./utils/logger.js";

export interface RundeckConfig {
  rundeckUrl?: string;
  apiToken?: string;
  apiVersion: string;
  docsPath: string;
}

class ConfigManager {
  private config: RundeckConfig = {
    apiVersion: "46",
    docsPath: this.findDocsPath(),
  };

  /**
   * Find the docs path - try multiple locations
   */
  private findDocsPath(): string {
    // Try relative to current working directory
    const possiblePaths = [
      join(process.cwd(), "docs", "docs"),
      join(process.cwd(), "..", "docs", "docs"),
      join(process.cwd(), "docs"),
      join(process.cwd(), "..", "docs"),
      resolve(process.cwd(), "docs", "docs"),
    ];

    for (const path of possiblePaths) {
      try {
        const resolved = resolve(path);
        if (existsSync(resolved)) {
          return resolved;
        }
      } catch {
        // Continue to next path
      }
    }

    // Default fallback
    return join(process.cwd(), "docs", "docs");
  }

  /**
   * Initialize configuration from environment variables
   */
  initialize(): void {
    this.config.rundeckUrl = process.env.RUNDECK_URL;
    this.config.apiToken = process.env.RUNDECK_TOKEN;
    this.config.apiVersion = process.env.RUNDECK_API_VERSION || "46";
    
    // Only override docs path if explicitly set
    if (process.env.RUNDECK_DOCS_PATH) {
      this.config.docsPath = resolve(process.env.RUNDECK_DOCS_PATH);
    } else {
      // Re-find docs path on initialization
      this.config.docsPath = this.findDocsPath();
    }
  }

  /**
   * Refresh configuration from environment variables
   * Only updates URL, token, and API version (doesn't change docs path)
   */
  refreshFromEnvironment(): void {
    const hadUrl = !!this.config.rundeckUrl;
    const hadToken = !!this.config.apiToken;
    
    this.config.rundeckUrl = process.env.RUNDECK_URL || this.config.rundeckUrl;
    this.config.apiToken = process.env.RUNDECK_TOKEN || this.config.apiToken;
    this.config.apiVersion = process.env.RUNDECK_API_VERSION || this.config.apiVersion;
    
    if (!hadToken && this.config.apiToken) {
      logger.info("RUNDECK_TOKEN found in environment and loaded");
    }
    if (!hadUrl && this.config.rundeckUrl) {
      logger.info("RUNDECK_URL found in environment and loaded");
    }
  }

  /**
   * Set Rundeck connection details
   */
  setRundeckConnection(
    url: string,
    token: string,
    apiVersion?: string
  ): void {
    this.config.rundeckUrl = url;
    this.config.apiToken = token;
    if (apiVersion) {
      this.config.apiVersion = apiVersion;
    }
  }

  /**
   * Get current configuration
   * If token or URL is missing, refresh from environment first
   */
  getConfig(): Readonly<RundeckConfig> {
    // Refresh from environment if token or URL is missing
    if (!this.config.apiToken || !this.config.rundeckUrl) {
      this.refreshFromEnvironment();
    }
    return { ...this.config };
  }

  /**
   * Check if Rundeck is configured
   */
  isRundeckConfigured(): boolean {
    return !!(this.config.rundeckUrl && this.config.apiToken);
  }

  /**
   * Get API base URL
   */
  getApiBaseUrl(): string {
    if (!this.config.rundeckUrl) {
      throw new Error("Rundeck URL not configured");
    }
    return `${this.config.rundeckUrl}/api/${this.config.apiVersion}`;
  }
}

export const configManager = new ConfigManager();
