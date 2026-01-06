/**
 * Tests for guidance utility
 */

import {
  getJobCreationGuidance,
  getApiCallGuidance,
  getProjectConfigGuidance,
  getAuthSetupGuidance,
  getNodeFilterGuidance,
  getPluginIntegrationGuidance,
} from "../../utils/guidance.js";

describe("Guidance Utility", () => {
  describe("getJobCreationGuidance", () => {
    it("should return guidance content", () => {
      const guidance = getJobCreationGuidance();
      expect(guidance).toContain("Creating a Rundeck Job");
      expect(guidance).toContain("name");
      expect(guidance).toContain("project");
      expect(guidance).toContain("workflow_steps");
    });
  });

  describe("getApiCallGuidance", () => {
    it("should return guidance content", () => {
      const guidance = getApiCallGuidance();
      expect(guidance).toContain("Calling the Rundeck API");
      expect(guidance).toContain("endpoint");
      expect(guidance).toContain("method");
    });
  });

  describe("getProjectConfigGuidance", () => {
    it("should return guidance content", () => {
      const guidance = getProjectConfigGuidance();
      expect(guidance).toContain("Configuring a Rundeck Project");
    });
  });

  describe("getAuthSetupGuidance", () => {
    it("should return guidance content", () => {
      const guidance = getAuthSetupGuidance();
      expect(guidance).toContain("Setting Up Rundeck API Authentication");
      expect(guidance).toContain("RUNDECK_URL");
      expect(guidance).toContain("RUNDECK_TOKEN");
      expect(guidance).toContain("environment variables");
    });
  });

  describe("getNodeFilterGuidance", () => {
    it("should return guidance content", () => {
      const guidance = getNodeFilterGuidance();
      expect(guidance).toContain("Node Filter");
      expect(guidance).toContain("tags:");
    });
  });

  describe("getPluginIntegrationGuidance", () => {
    it("should return guidance content", () => {
      const guidance = getPluginIntegrationGuidance();
      expect(guidance).toContain("Integrating Rundeck Plugins");
    });
  });
});



