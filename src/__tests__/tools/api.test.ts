/**
 * Tests for API tools
 */

import { jest } from "@jest/globals";
import {
  rundeckSetupToken,
  rundeckListEndpoints,
} from "../../tools/api.js";
import { configManager } from "../../config.js";

// Mock fetch for API calls
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch as unknown as typeof fetch;

describe("API Tools", () => {
  beforeEach(() => {
    configManager.initialize();
    mockFetch.mockClear();
    jest.clearAllMocks();
  });

  describe("rundeckSetupToken", () => {
    it("should configure Rundeck connection", () => {
      const result = rundeckSetupToken({
        rundeck_url: "https://test.rundeck.com",
        api_token: "test-token-123",
        api_version: "45",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("test.rundeck.com");
      expect(result.message).toContain("API v45");

      const config = configManager.getConfig();
      expect(config.rundeckUrl).toBe("https://test.rundeck.com");
      expect(config.apiToken).toBe("test-token-123");
      expect(config.apiVersion).toBe("45");
    });

    it("should use default API version if not provided", () => {
      rundeckSetupToken({
        rundeck_url: "https://test.rundeck.com",
        api_token: "test-token",
      });

      const config = configManager.getConfig();
      expect(config.apiVersion).toBe("46");
    });
  });

  describe("rundeckListEndpoints", () => {
    it("should return list of endpoints", () => {
      // This will return empty array if docs don't exist, but function should work
      const endpoints = rundeckListEndpoints();

      expect(Array.isArray(endpoints)).toBe(true);
    });

    it("should filter by category when provided", () => {
      const endpoints = rundeckListEndpoints({ category: "jobs" });

      expect(Array.isArray(endpoints)).toBe(true);
      // If endpoints exist, they should all be jobs category
      endpoints.forEach((endpoint) => {
        if (endpoint.category) {
          expect(endpoint.category).toBe("jobs");
        }
      });
    });
  });

  describe("rundeckApiCall", () => {
    it("should throw error when Rundeck not configured", async () => {
      // Reset config
      configManager.initialize();

      const { rundeckApiCall } = await import("../../tools/api.js");

      await expect(
        rundeckApiCall({
          endpoint: "/projects",
          method: "GET",
        })
      ).rejects.toThrow("Rundeck not configured");
    });

    it("should make API call when configured", async () => {
      configManager.setRundeckConnection(
        "https://test.rundeck.com",
        "test-token"
      );

      const mockResponse = {
        status: 200,
        headers: {
          get: (name: string) => name === "content-type" ? "application/json" : null,
          forEach: () => {},
        } as unknown as Headers,
        json: async () => ({ projects: [] }),
      } as Response;
      mockFetch.mockResolvedValueOnce(mockResponse);

      const { rundeckApiCall } = await import("../../tools/api.js");

      const result = await rundeckApiCall({
        endpoint: "/api/46/projects",
        method: "GET",
      });

      expect(result.status).toBe(200);
      // The endpoint "/projects" gets prepended with the API base URL
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain("/api/46/projects");
      expect(callArgs[1]).toMatchObject({
        method: "GET",
        headers: expect.objectContaining({
          "X-Rundeck-Auth-Token": "test-token",
        }),
      });
    });

    it("should include request body for POST requests", async () => {
      configManager.setRundeckConnection(
        "https://test.rundeck.com",
        "test-token"
      );

      const mockResponse2 = {
        status: 200,
        headers: {
          get: (name: string) => name === "content-type" ? "application/json" : null,
          forEach: () => {},
        } as unknown as Headers,
        json: async () => ({ success: true }),
      } as Response;
      mockFetch.mockResolvedValueOnce(mockResponse2);

      const { rundeckApiCall } = await import("../../tools/api.js");

      await rundeckApiCall({
        endpoint: "/job/123/run",
        method: "POST",
        body: { options: { key: "value" } },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ options: { key: "value" } }),
        })
      );
    });

    it("should include query parameters", async () => {
      configManager.setRundeckConnection(
        "https://test.rundeck.com",
        "test-token"
      );

      const mockResponse3 = {
        status: 200,
        headers: {
          get: (name: string) => name === "content-type" ? "application/json" : null,
          forEach: () => {},
        } as unknown as Headers,
        json: async () => ({}),
      } as Response;
      mockFetch.mockResolvedValueOnce(mockResponse3);

      const { rundeckApiCall } = await import("../../tools/api.js");

      await rundeckApiCall({
        endpoint: "/executions",
        method: "GET",
        query_params: { max: "10", offset: "0" },
      });

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("max=10");
      expect(callUrl).toContain("offset=0");
    });
  });
});

