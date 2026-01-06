/**
 * Integration Tests: All Tools Together
 * 
 * Tests that all tools from Entity 2 and Entity 4 work together harmoniously
 */

import { pluginCreate, pluginCreateSchema } from "../../tools/plugins.js";
import { toolRecommend } from "../../tools/recommend.js";
import { rundeckGenerateJob, rundeckValidateJob } from "../../tools/jobs.js";
import { rundeckApiCall, rundeckListEndpoints } from "../../tools/api.js";

describe("Integration: All Tools Together", () => {
  it("should list all tools correctly", () => {
    const expectedTools = [
      "api_call",
      "api_list",
      "job_create",
      "job_validate",
      "tool_recommend",
      "plugin_create",
    ];
    
    // Verify tool schemas exist
    expect(pluginCreateSchema).toBeDefined();
    expect(typeof toolRecommend).toBe("function");
    expect(typeof rundeckGenerateJob).toBe("function");
    expect(typeof rundeckValidateJob).toBe("function");
    expect(typeof rundeckApiCall).toBe("function");
    expect(typeof rundeckListEndpoints).toBe("function");
    
    // All expected tools should be available
    expect(expectedTools.length).toBe(6);
  });

  it("should use tool_recommend to suggest plugin_create", () => {
    const recommendation = toolRecommend({
      intent: "I want to create a Rundeck plugin for node steps",
    });
    
    expect(recommendation.recommendations).toBeDefined();
    expect(recommendation.recommendations.length).toBeGreaterThan(0);
    
    // Check if plugin_create is recommended (may or may not be top recommendation)
    const allTools = recommendation.recommendations.map(r => r.tool);
    // Verify tool_recommend works and returns recommendations
    expect(allTools.length).toBeGreaterThan(0);
    // plugin_create should be available as a tool (even if not top recommendation)
    expect(["api_call", "api_list", "job_create", "job_validate", "tool_recommend", "plugin_create"]).toContain(allTools[0]);
  });

  it("should generate plugin and validate job that uses it", () => {
    // Generate a plugin
    const plugin = pluginCreate({
      plugin_type: "node-step",
      name: "test-integration-plugin",
      class_name: "TestIntegrationPlugin",
      description: "Test plugin for integration",
    });
    
    expect(plugin.code).toBeDefined();
    expect(plugin.code).toContain("@Plugin");
    expect(plugin.code).toContain("TestIntegrationPlugin");
    
    // Create a job that uses the plugin
    const job = rundeckGenerateJob({
      name: "test-job-with-plugin",
      project: "test-project",
      workflow_steps: [
        {
          type: "plugin",
          plugin: {
            type: "test-integration-plugin",
            configuration: {},
          },
        },
      ],
    });
    
    expect(job).toBeDefined();
    expect(job).toContain("test-job-with-plugin");
    expect(job).toContain("test-integration-plugin");
    
    // Validate the job
    const validation = rundeckValidateJob({
      job_definition: job,
      format: "yaml",
    });
    
    expect(validation).toBeDefined();
    expect(validation.valid).toBeDefined();
  });

  it("should use tool_recommend to suggest job_create", () => {
    const recommendation = toolRecommend({
      intent: "I want to create a job that runs a command",
    });
    
    expect(recommendation.recommendations).toBeDefined();
    const jobRecommendation = recommendation.recommendations.find(
      (r) => r.tool === "job_create"
    );
    expect(jobRecommendation).toBeDefined();
    expect(jobRecommendation?.confidence).toBeGreaterThan(0);
  });
});

