/**
 * Tests for guidance utility
 */

import {
  getJobCreationGuidance,
  getApiCallGuidance,
  getJobValidationGuidance,
  getProjectConfigGuidance,
  getAuthSetupGuidance,
  getNodeFilterGuidance,
  getPluginIntegrationGuidance,
  getRunnerGuidance,
  getAclManageGuidance,
  getDeleteConfirmationGuidance,
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

    it("includes fallback guidance to api_call", () => {
      const guidance = getJobCreationGuidance();
      expect(guidance).toContain("## Fallback");
      expect(guidance).toContain("api_call");
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

  describe("getJobValidationGuidance", () => {
    it("should return guidance content", () => {
      const guidance = getJobValidationGuidance();
      expect(guidance).toContain("Validating a Rundeck Job");
      expect(guidance).toContain("job_definition");
      expect(guidance).toContain("format");
    });

    it("includes fallback guidance to api_call", () => {
      const guidance = getJobValidationGuidance();
      expect(guidance).toContain("## Fallback");
      expect(guidance).toContain("api_call");
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

  describe("getRunnerGuidance", () => {
    it("should return guidance content", () => {
      const guidance = getRunnerGuidance();
      expect(guidance).toContain("Creating a Rundeck Runner");
    });

    it("includes fallback guidance to api_call", () => {
      const guidance = getRunnerGuidance();
      expect(guidance).toContain("## Fallback");
      expect(guidance).toContain("api_call");
      expect(guidance).toContain("runnerManagement/runners");
    });
  });

  describe("getAclManageGuidance", () => {
    it("should return guidance content", () => {
      const guidance = getAclManageGuidance();
      expect(guidance).toContain("Managing Rundeck ACL Policies");
    });

    it("includes fallback guidance to api_call", () => {
      const guidance = getAclManageGuidance();
      expect(guidance).toContain("## Fallback");
      expect(guidance).toContain("api_call");
    });
  });

  describe("getDeleteConfirmationGuidance", () => {
    it("names the tool and target, and never implies the delete already happened", () => {
      const guidance = getDeleteConfirmationGuidance("acl_manage", "ACL policy 'admin' (system scope)");
      expect(guidance).toContain("acl_manage");
      expect(guidance).toContain("ACL policy 'admin' (system scope)");
      expect(guidance).toContain("confirm");
      expect(guidance).toContain("Nothing has been deleted");
    });
  });
});



