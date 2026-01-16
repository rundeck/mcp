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
});


