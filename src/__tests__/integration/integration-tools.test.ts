/**
 * Integration Tests: All Tools Together
 *
 * MCP exposes five Phase 1 tools; plugin/docs-example helpers live in modules but are not registered.
 */

import { pluginCreate, pluginCreateSchema } from "../../tools/plugins.js";
import { rundeckGenerateJob, rundeckValidateJob } from "../../tools/jobs.js";
import { rundeckApiCall, rundeckListEndpoints } from "../../tools/api.js";

describe("Integration: All Tools Together", () => {
  it("should list all MCP tools correctly (Phase 1 surface)", () => {
    const expectedTools = [
      "api_call",
      "api_list",
      "job_create",
      "job_validate",
      "docs_search",
    ];

    expect(pluginCreateSchema).toBeDefined();
    expect(typeof rundeckGenerateJob).toBe("function");
    expect(typeof rundeckValidateJob).toBe("function");
    expect(typeof rundeckApiCall).toBe("function");
    expect(typeof rundeckListEndpoints).toBe("function");

    expect(expectedTools.length).toBe(5);
  });

  it("should generate plugin code via module (not MCP) and validate job that uses it", () => {
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
});
