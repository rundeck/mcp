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
  getConfirmationUnavailableGuidance,
  getConfirmationDeclinedGuidance,
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

  describe("getConfirmationUnavailableGuidance", () => {
    it("names the tool and action, and states there is no bypass", () => {
      const guidance = getConfirmationUnavailableGuidance("acl_manage", {
        phrase: "permanently delete ACL policy 'admin' (system scope)",
        consequence: "Rundeck's API has no undo for this.",
      });
      expect(guidance).toContain("acl_manage");
      expect(guidance).toContain("ACL policy 'admin' (system scope)");
      expect(guidance).toContain("Nothing has happened");
      expect(guidance).toContain("no parameter that can substitute");
    });
  });

  describe("getConfirmationDeclinedGuidance", () => {
    it("names the tool and action, and never implies it should be retried", () => {
      const guidance = getConfirmationDeclinedGuidance("api_call", {
        phrase: "regenerate credentials for the runner at `runnerManagement/runner/abc/regenerateCreds`",
        consequence: "This immediately invalidates the runner's current token.",
      });
      expect(guidance).toContain("api_call");
      expect(guidance).toContain("regenerate credentials");
      expect(guidance).toContain("Nothing happened");
      expect(guidance).toContain("Do not retry");
    });
  });
});



