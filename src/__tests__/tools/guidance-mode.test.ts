/**
 * Tests for guidance mode in tools
 * Tests that tools return guidance when called without required parameters
 */

import {
  getJobCreationGuidance,
  getApiCallGuidance,
  getJobValidationGuidance,
  getAuthSetupGuidance,
} from "../../utils/guidance.js";

describe("Guidance Mode", () => {
  describe("job_create guidance", () => {
    it("should provide guidance when called without required params", () => {
      const guidance = getJobCreationGuidance();
      
      // Check that guidance contains required parameter information
      expect(guidance).toContain("name");
      expect(guidance).toContain("project");
      expect(guidance).toContain("workflow_steps");
      expect(guidance).toContain("Required Parameters");
    });

    it("should include examples and next steps", () => {
      const guidance = getJobCreationGuidance();
      expect(guidance).toContain("Next Steps");
      expect(guidance).toContain("job_create");
      expect(guidance).toContain("rundeck://docs/manual/jobs");
    });
  });

  describe("api_call guidance", () => {
    it("should provide guidance when called without required params", () => {
      const guidance = getApiCallGuidance();
      
      expect(guidance).toContain("endpoint");
      expect(guidance).toContain("method");
      expect(guidance).toContain("Required Parameters");
    });

    it("should include authentication setup instructions", () => {
      const guidance = getApiCallGuidance();
      expect(guidance).toContain("RUNDECK_URL");
      expect(guidance).toContain("RUNDECK_TOKEN");
      expect(guidance).toContain("environment variables");
    });
  });

  describe("job_validate guidance", () => {
    it("should describe required parameters", () => {
      const guidance = getJobValidationGuidance();
      expect(guidance).toContain("job_definition");
      expect(guidance).toContain("format");
      expect(guidance).toContain("yaml");
      expect(guidance).toContain("rundeck://jobs/schema");
    });
  });

  describe("auth_setup guidance", () => {
    it("should provide guidance for environment variable setup", () => {
      const guidance = getAuthSetupGuidance();
      
      expect(guidance).toContain("RUNDECK_URL");
      expect(guidance).toContain("RUNDECK_TOKEN");
      expect(guidance).toContain("environment variables");
    });

    it("should include security best practices", () => {
      const guidance = getAuthSetupGuidance();
      expect(guidance).toContain("Security Best Practices");
      expect(guidance).toContain("HTTPS");
    });
  });
});



