/**
 * Tests for configuration management
 */

import { configManager } from "../config.js";

describe("Config Manager", () => {
  beforeEach(() => {
    // Reset config before each test
    delete process.env.RUNDECK_URL;
    delete process.env.RUNDECK_TOKEN;
    delete process.env.RUNDECK_API_VERSION;
    delete process.env.RUNDECK_DOCS_PATH;
    configManager.initialize();
  });

  describe("initialize", () => {
    it("should load configuration from environment variables", () => {
      process.env.RUNDECK_URL = "https://test.rundeck.com";
      process.env.RUNDECK_TOKEN = "test-token";
      process.env.RUNDECK_API_VERSION = "45";
      process.env.RUNDECK_DOCS_PATH = "/custom/path";

      configManager.initialize();

      const config = configManager.getConfig();
      expect(config.rundeckUrl).toBe("https://test.rundeck.com");
      expect(config.apiToken).toBe("test-token");
      expect(config.apiVersion).toBe("45");
      expect(config.docsPath).toBe("/custom/path");
    });

    it("should use default values when env vars not set", () => {
      configManager.initialize();

      const config = configManager.getConfig();
      expect(config.apiVersion).toBe("46");
      expect(config.docsPath).toBeTruthy();
    });
  });

  describe("setRundeckConnection", () => {
    it("should set Rundeck connection details", () => {
      configManager.setRundeckConnection(
        "https://test.rundeck.com",
        "test-token",
        "45"
      );

      const config = configManager.getConfig();
      expect(config.rundeckUrl).toBe("https://test.rundeck.com");
      expect(config.apiToken).toBe("test-token");
      expect(config.apiVersion).toBe("45");
    });

    it("should use default API version if not provided", () => {
      configManager.setRundeckConnection(
        "https://test.rundeck.com",
        "test-token"
      );

      const config = configManager.getConfig();
      expect(config.apiVersion).toBe("46");
    });
  });

  describe("isRundeckConfigured", () => {
    it("should return false when not configured", () => {
      expect(configManager.isRundeckConfigured()).toBe(false);
    });

    it("should return true when configured", () => {
      configManager.setRundeckConnection(
        "https://test.rundeck.com",
        "test-token"
      );

      expect(configManager.isRundeckConfigured()).toBe(true);
    });
  });

  describe("getApiBaseUrl", () => {
    it("should return correct API base URL", () => {
      configManager.setRundeckConnection(
        "https://test.rundeck.com",
        "test-token",
        "45"
      );

      const baseUrl = configManager.getApiBaseUrl();
      expect(baseUrl).toBe("https://test.rundeck.com/api/45");
    });

    it("should throw error when URL not configured", () => {
      expect(() => configManager.getApiBaseUrl()).toThrow(
        "Rundeck URL not configured"
      );
    });
  });

  describe("RUNDECK_INSTANCES registry", () => {
    afterEach(() => {
      delete process.env.RUNDECK_INSTANCES;
    });

    it("has no registry when RUNDECK_INSTANCES is unset", () => {
      configManager.initialize();
      expect(configManager.hasInstanceRegistry()).toBe(false);
      expect(configManager.listInstanceNames()).toEqual([]);
    });

    it("connects to the default instance on initialize", () => {
      process.env.RUNDECK_INSTANCES = JSON.stringify({
        default: "prod",
        instances: {
          prod: { url: "https://prod.example.com", token: "prod-token" },
          staging: { url: "https://staging.example.com", token: "staging-token" },
        },
      });

      configManager.initialize();

      expect(configManager.hasInstanceRegistry()).toBe(true);
      expect(configManager.listInstanceNames().sort()).toEqual(["prod", "staging"]);
      const config = configManager.getConfig();
      expect(config.rundeckUrl).toBe("https://prod.example.com");
      expect(config.apiToken).toBe("prod-token");
    });

    it("clears any stray env-var connection when the registry has no default", () => {
      process.env.RUNDECK_URL = "https://old.example.com";
      process.env.RUNDECK_TOKEN = "old-token";
      process.env.RUNDECK_INSTANCES = JSON.stringify({
        instances: {
          prod: { url: "https://prod.example.com", token: "prod-token" },
        },
      });

      configManager.initialize();

      expect(configManager.hasInstanceRegistry()).toBe(true);
      const config = configManager.getConfig();
      expect(config.rundeckUrl).toBeUndefined();
      expect(config.apiToken).toBeUndefined();
    });

    it("switches the active connection on a matching instance name", () => {
      process.env.RUNDECK_INSTANCES = JSON.stringify({
        default: "prod",
        instances: {
          prod: { url: "https://prod.example.com", token: "prod-token" },
          staging: { url: "https://staging.example.com", token: "staging-token" },
        },
      });
      configManager.initialize();

      const result = configManager.connectToInstance("staging");

      expect(result).toEqual({ ok: true });
      const config = configManager.getConfig();
      expect(config.rundeckUrl).toBe("https://staging.example.com");
      expect(config.apiToken).toBe("staging-token");
    });

    it("clears the connection instead of leaving the previous instance active on a miss", () => {
      process.env.RUNDECK_INSTANCES = JSON.stringify({
        default: "prod",
        instances: {
          prod: { url: "https://prod.example.com", token: "prod-token" },
        },
      });
      configManager.initialize();

      const result = configManager.connectToInstance("does-not-exist");

      expect(result.ok).toBe(false);
      const config = configManager.getConfig();
      expect(config.rundeckUrl).toBeUndefined();
      expect(config.apiToken).toBeUndefined();
    });

    it("does not resurrect stale RUNDECK_URL/RUNDECK_TOKEN after a failed switch", () => {
      // A user who already had single-instance env vars exported, then also
      // set RUNDECK_INSTANCES, is a real scenario the launcher script doesn't
      // prevent (it only ever adds RUNDECK_INSTANCES, never unsets these).
      process.env.RUNDECK_URL = "https://old.example.com";
      process.env.RUNDECK_TOKEN = "old-token";
      process.env.RUNDECK_INSTANCES = JSON.stringify({
        default: "prod",
        instances: {
          prod: { url: "https://prod.example.com", token: "prod-token" },
        },
      });
      configManager.initialize();

      const result = configManager.connectToInstance("does-not-exist");
      expect(result.ok).toBe(false);

      // getConfig()'s lazy refreshFromEnvironment() fallback must not
      // repopulate rundeckUrl/apiToken from the still-exported env vars.
      const config = configManager.getConfig();
      expect(config.rundeckUrl).toBeUndefined();
      expect(config.apiToken).toBeUndefined();
    });

    it("falls back to no registry on malformed JSON without throwing", () => {
      process.env.RUNDECK_INSTANCES = "{not valid json";

      expect(() => configManager.initialize()).not.toThrow();
      expect(configManager.hasInstanceRegistry()).toBe(false);
    });

    it("falls back to no registry when default does not match a registered instance", () => {
      process.env.RUNDECK_INSTANCES = JSON.stringify({
        default: "missing",
        instances: {
          prod: { url: "https://prod.example.com", token: "prod-token" },
        },
      });

      configManager.initialize();

      expect(configManager.hasInstanceRegistry()).toBe(false);
    });

    it("falls back to no registry when an instance entry is missing url/token", () => {
      process.env.RUNDECK_INSTANCES = JSON.stringify({
        default: "prod",
        instances: {
          prod: { url: "https://prod.example.com" },
        },
      });

      configManager.initialize();

      expect(configManager.hasInstanceRegistry()).toBe(false);
    });
  });
});


