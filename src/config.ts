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

interface RundeckInstanceEntry {
  url: string;
  token: string;
}

interface RundeckInstanceRegistry {
  default?: string;
  instances: Record<string, RundeckInstanceEntry>;
}

class ConfigManager {
  private config: RundeckConfig = {
    apiVersion: "46",
    docsPath: this.findDocsPath(),
  };

  private instanceRegistry: RundeckInstanceRegistry | null = null;

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

    // Runs after the RUNDECK_URL/RUNDECK_TOKEN assignment above so that, when
    // RUNDECK_INSTANCES is also set, the registry's "default" instance wins
    // over any stray RUNDECK_URL/RUNDECK_TOKEN left in the environment.
    this.loadInstanceRegistry();
  }

  /**
   * Parse RUNDECK_INSTANCES (a JSON registry of named Rundeck instances) and,
   * if it defines a valid "default", connect to it immediately. Malformed or
   * absent input is not a fatal error — it just leaves multi-instance mode
   * disabled, falling back to whatever RUNDECK_URL/RUNDECK_TOKEN already set.
   */
  private loadInstanceRegistry(): void {
    this.instanceRegistry = null;

    const raw = process.env.RUNDECK_INSTANCES;
    if (!raw) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.error("RUNDECK_INSTANCES is not valid JSON — ignoring it", err);
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      logger.error(
        "RUNDECK_INSTANCES must be a JSON object with \"default\" and \"instances\" — ignoring it"
      );
      return;
    }

    const { default: defaultName, instances } = parsed as {
      default?: unknown;
      instances?: unknown;
    };

    if (typeof instances !== "object" || instances === null || Array.isArray(instances)) {
      logger.error('RUNDECK_INSTANCES is missing an "instances" object — ignoring it');
      return;
    }

    const entries = instances as Record<string, unknown>;
    const validated: Record<string, RundeckInstanceEntry> = {};
    for (const [name, entry] of Object.entries(entries)) {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof (entry as RundeckInstanceEntry).url !== "string" ||
        typeof (entry as RundeckInstanceEntry).token !== "string"
      ) {
        logger.error(
          `RUNDECK_INSTANCES entry "${name}" is missing "url"/"token" — ignoring RUNDECK_INSTANCES`
        );
        return;
      }
      validated[name] = {
        url: (entry as RundeckInstanceEntry).url,
        token: (entry as RundeckInstanceEntry).token,
      };
    }

    if (Object.keys(validated).length === 0) {
      logger.error('RUNDECK_INSTANCES has no entries under "instances" — ignoring it');
      return;
    }

    if (defaultName !== undefined && typeof defaultName !== "string") {
      logger.error('RUNDECK_INSTANCES "default" must be a string — ignoring it');
      return;
    }

    if (defaultName !== undefined && !validated[defaultName]) {
      logger.error(
        `RUNDECK_INSTANCES "default": "${defaultName}" does not match any registered instance — ignoring it`
      );
      return;
    }

    this.instanceRegistry = { default: defaultName, instances: validated };

    if (defaultName) {
      this.setRundeckConnection(validated[defaultName].url, validated[defaultName].token);
      logger.info(`Connected to default Rundeck instance "${defaultName}" from RUNDECK_INSTANCES`);
    }
  }

  /** True once a valid RUNDECK_INSTANCES registry has been loaded. */
  hasInstanceRegistry(): boolean {
    return this.instanceRegistry !== null;
  }

  /** Names of registered instances, for guidance/error text — never url/token values. */
  listInstanceNames(): string[] {
    return this.instanceRegistry ? Object.keys(this.instanceRegistry.instances) : [];
  }

  /**
   * Switch the active connection to a registered instance by name.
   * On a miss, the connection is cleared rather than left pointing at
   * whatever was active before — this is what makes a failed switch fail
   * closed: every live-API tool's existing "not configured" guard then
   * refuses to run until a rundeck_connect call actually succeeds.
   */
  connectToInstance(name: string): { ok: true } | { ok: false; error: string } {
    const entry = this.instanceRegistry?.instances[name];
    if (!entry) {
      this.clearConnection();
      const available = this.listInstanceNames();
      return {
        ok: false,
        error: `No such instance "${name}". Registered instances: ${
          available.length > 0 ? available.join(", ") : "(none)"
        }.`,
      };
    }
    this.setRundeckConnection(entry.url, entry.token);
    return { ok: true };
  }

  /** Clears the active connection so live-API tools fail closed instead of using a stale instance. */
  clearConnection(): void {
    this.config.rundeckUrl = undefined;
    this.config.apiToken = undefined;
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
