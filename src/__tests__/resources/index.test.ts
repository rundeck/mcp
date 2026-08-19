/**
 * Tests for resource handlers
 */

import { handleResource, listResources } from "../../resources/index.js";
import { existsSync } from "fs";
import { join } from "path";
import { configManager } from "../../config.js";

describe("Resource Handlers", () => {
  beforeEach(() => {
    configManager.initialize();
  });

  describe("listResources", () => {
    it("should return list of available resources", () => {
      const resources = listResources();

      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);

      // Check that resources have required fields
      resources.forEach((resource) => {
        expect(resource).toHaveProperty("uri");
        expect(resource).toHaveProperty("description");
        expect(resource.uri).toMatch(/^rundeck:\/\//);
      });
    });

    it("should include API resources", () => {
      const resources = listResources();
      const apiResources = resources.filter((r) => r.uri.startsWith("rundeck://api"));

      expect(apiResources.length).toBeGreaterThan(0);
    });

    it("should include job resources", () => {
      const resources = listResources();
      const jobResources = resources.filter((r) => r.uri.startsWith("rundeck://jobs/"));

      expect(jobResources.length).toBeGreaterThan(0);
    });
  });

  describe("handleResource", () => {
    it("should handle API index resource (new URI)", () => {
      const docsPath = configManager.getConfig().docsPath;
      const apiIndexPath = join(docsPath, "api", "index.md");

      if (existsSync(apiIndexPath)) {
        const result = handleResource("rundeck://api");
        expect(result).toBeTruthy();
        expect(typeof result).toBe("string");
      } else {
        // If docs don't exist, should return error message
        const result = handleResource("rundeck://api");
        expect(result).toContain("not found");
      }
    });

    it("should handle API authentication resource (new URI)", () => {
      const result = handleResource("rundeck://api/auth");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should handle job schema resource with format parameter", () => {
      const docsPath = configManager.getConfig().docsPath;
      const yamlSchemaPath = join(
        docsPath,
        "manual",
        "document-format-reference",
        "job-yaml-v12.md"
      );

      const result = handleResource("rundeck://jobs/schema?format=yaml");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
      // Either contains the content or an error message
      // The file may not exist in test environment, so just check it's a string response
      if (existsSync(yamlSchemaPath)) {
        // If file exists, should contain content
        expect(result.length).toBeGreaterThan(0);
      } else {
        // If file doesn't exist, should contain error message
        expect(result.toLowerCase()).toMatch(/not found|error/i);
      }
    });

    it("should handle job schema resource with JSON format", () => {
      const result = handleResource("rundeck://jobs/schema?format=json");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should handle config system resource", () => {
      const result = handleResource("rundeck://config/system");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should handle learning getting-started resource (new URI)", () => {
      const result = handleResource("rundeck://learn");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should handle plugins index resource (new URI)", () => {
      const result = handleResource("rundeck://plugins");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should return error message for unknown resource", () => {
      const result = handleResource("rundeck://unknown/resource");
      expect(result).toContain("not found");
    });

    it("should handle endpoint resources with path", () => {
      const result = handleResource(
        "rundeck://api/endpoint/%2Fapi%2F59%2Fprojects"
      );
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should handle how-to resources with topic (new URI)", () => {
      const result = handleResource("rundeck://learn/howto/example");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should handle reference filters resource (new URI)", () => {
      const result = handleResource("rundeck://ref/filters");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("should handle reference terms resource (new URI)", () => {
      const result = handleResource("rundeck://ref/terms");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });
  });
});

