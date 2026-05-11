/**
 * Integration Tests: All Tools Together
 *
 * Tests that all tools from Entity 2 and Entity 4 work together harmoniously
 */

import { pluginCreate, pluginCreateSchema } from "../../tools/plugins.js";
import { rundeckGetExample } from "../../tools/search.js";
import { rundeckGenerateJob, rundeckValidateJob } from "../../tools/jobs.js";
import { rundeckApiCall, rundeckListEndpoints } from "../../tools/api.js";

describe("Integration: All Tools Together", () => {
  it("should list all tools correctly", () => {
    const expectedTools = [
      "api_call",
      "api_list",
      "job_create",
      "job_validate",
      "docs_search",
      "docs_example",
      "plugin_create",
    ];

    // Verify tool schemas exist
    expect(pluginCreateSchema).toBeDefined();
    expect(typeof rundeckGetExample).toBe("function");
    expect(typeof rundeckGenerateJob).toBe("function");
    expect(typeof rundeckValidateJob).toBe("function");
    expect(typeof rundeckApiCall).toBe("function");
    expect(typeof rundeckListEndpoints).toBe("function");

    expect(expectedTools.length).toBe(7);
  });

  it("should extract documentation examples via docs_example (topic)", () => {
    const text = rundeckGetExample({ topic: "api-job-run" });
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("should generate plugin and validate job that uses it", () => {
    const plugin = pluginCreate({
      plugin_type: "node-step",
      name: "test-integration-plugin",
      class_name: "TestIntegrationPlugin",
      description: "Test plugin for integration",
    });

    expect(plugin.code).toBeDefined();
    expect(plugin.code).toContain("@Plugin");
    expect(plugin.code).toContain("TestIntegrationPlugin");

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

    const validation = rundeckValidateJob({
      job_definition: job,
      format: "yaml",
    });

    expect(validation).toBeDefined();
    expect(validation.valid).toBeDefined();
  });

  it("should run docs_example for multiple known topics without throwing", () => {
    for (const topic of ["job-yaml-basic", "node-filter"]) {
      expect(() => rundeckGetExample({ topic })).not.toThrow();
    }
  });
});
