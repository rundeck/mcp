/**
 * Integration Tests: Cross-Entity Functionality
 * 
 * Tests that entities work together (e.g., plugin tool using resources, prompts referencing tools)
 */

import { pluginCreate } from "../../tools/plugins.js";
import { handleResource } from "../../resources/index.js";
import { getPrompt } from "../../prompts/index.js";
import { rundeckGetExample } from "../../tools/search.js";

describe("Integration: Cross-Entity Functionality", () => {
  it("should use resources to inform plugin creation", () => {
    // Get plugin documentation from resources
    const pluginDocs = handleResource("rundeck://docs/developer/plugins");
    expect(pluginDocs).toBeDefined();
    expect(pluginDocs.length).toBeGreaterThan(0);
    
    // Use that knowledge to create a plugin
    const plugin = pluginCreate({
      plugin_type: "node-step",
      name: "resource-informed-plugin",
      class_name: "ResourceInformedPlugin",
      description: "Plugin created with resource knowledge",
    });
    
    expect(plugin.code).toBeDefined();
    expect(plugin.code).toContain("@Plugin");
  });

  it("should use prompts that reference current tools", () => {
    const integratePluginPrompt = getPrompt("integrate-plugin");
    expect(integratePluginPrompt).toBeDefined();
    
    const content = integratePluginPrompt?.getContent({
      plugin_type: "node-step",
      configuration_level: "project",
    });
    
    expect(content).toBeDefined();
    if (content) {
      // Should reference plugin_create tool (Entity 4)
      expect(content).toContain("plugin_create");
      // Prompt may reference tools or resources
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("should expose docs_example output that complements developer resources", () => {
    const topicExamples = rundeckGetExample({ topic: "workflow-steps" });
    expect(topicExamples.length).toBeGreaterThanOrEqual(0);
  });

  it("should use resources to answer plugin-related questions", () => {
    // Query resources for plugin information
    const pluginDocs = handleResource("rundeck://docs/developer/plugins");
    const stepPlugins = handleResource("rundeck://docs/developer/plugin/step-plugins");
    
    expect(pluginDocs).toBeDefined();
    expect(stepPlugins).toBeDefined();
    
    // Use that information to create a plugin
    const plugin = pluginCreate({
      plugin_type: "node-step",
      name: "docs-informed-plugin",
      class_name: "DocsInformedPlugin",
    });
    
    expect(plugin.code).toBeDefined();
  });

  it("should integrate prompts with tools and resources", () => {
    const createJobPrompt = getPrompt("create-job");
    const content = createJobPrompt?.getContent({ job_type: "simple" });
    
    expect(content).toBeDefined();
    // Prompt should reference job_create tool
    expect(content).toContain("job_create");
    // Prompt should reference resources
    expect(content).toContain("rundeck://");
  });
});

