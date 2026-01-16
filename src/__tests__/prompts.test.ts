/**
 * Tests for prompts functionality
 */

import { prompts, getPrompt } from "../prompts/index.js";

describe("Prompts", () => {
  describe("prompts array", () => {
    it("should contain all expected prompts", () => {
      const expectedPrompts = [
        "create-job",
        "call-api",
        "configure-project",
        "setup-authentication",
        "write-node-filter",
        "integrate-plugin",
      ];
      
      const promptNames = prompts.map((p) => p.name);
      expect(promptNames).toEqual(expect.arrayContaining(expectedPrompts));
      expect(prompts.length).toBe(6);
    });

    it("should have all prompts with required fields", () => {
      for (const prompt of prompts) {
        expect(prompt.name).toBeDefined();
        expect(prompt.description).toBeDefined();
        expect(prompt.getContent).toBeDefined();
        expect(typeof prompt.getContent).toBe("function");
      }
    });

    it("should have prompts with argument schemas", () => {
      for (const prompt of prompts) {
        if (prompt.arguments && prompt.arguments.length > 0) {
          expect(prompt.argumentSchema).toBeDefined();
        }
      }
    });
  });

  describe("getPrompt", () => {
    it("should return prompt by name", () => {
      const prompt = getPrompt("create-job");
      expect(prompt).toBeDefined();
      expect(prompt?.name).toBe("create-job");
    });

    it("should return undefined for invalid prompt name", () => {
      const prompt = getPrompt("invalid-prompt");
      expect(prompt).toBeUndefined();
    });

    it("should return all prompts correctly", () => {
      const promptNames = [
        "create-job",
        "call-api",
        "configure-project",
        "setup-authentication",
        "write-node-filter",
        "integrate-plugin",
      ];
      
      for (const name of promptNames) {
        const prompt = getPrompt(name);
        expect(prompt).toBeDefined();
        expect(prompt?.name).toBe(name);
      }
    });
  });

  describe("prompt content generation", () => {
    it("should generate content for create-job prompt", () => {
      const prompt = getPrompt("create-job");
      expect(prompt).toBeDefined();
      
      const content = prompt!.getContent({ job_type: "multi-step" });
      expect(content).toContain("Creating a Rundeck Job");
      expect(content).toContain("multi-step");
    });

    it("should generate content for call-api prompt", () => {
      const prompt = getPrompt("call-api");
      expect(prompt).toBeDefined();
      
      const content = prompt!.getContent({ endpoint_category: "jobs" });
      expect(content).toContain("Calling the Rundeck API");
      expect(content).toContain("jobs");
    });

    it("should generate content for setup-authentication prompt", () => {
      const prompt = getPrompt("setup-authentication");
      expect(prompt).toBeDefined();
      
      const content = prompt!.getContent();
      expect(content).toContain("Setting Up Rundeck API Authentication");
      expect(content).toContain("RUNDECK_URL");
      expect(content).toContain("RUNDECK_TOKEN");
    });

    it("should generate content for write-node-filter prompt", () => {
      const prompt = getPrompt("write-node-filter");
      expect(prompt).toBeDefined();
      
      const content = prompt!.getContent({ filter_complexity: "complex" });
      expect(content).toContain("Writing Node Filter Expressions");
      expect(content).toContain("complex");
    });

    it("should generate content for integrate-plugin prompt", () => {
      const prompt = getPrompt("integrate-plugin");
      expect(prompt).toBeDefined();
      
      const content = prompt!.getContent({
        plugin_type: "node-step",
        configuration_level: "project",
      });
      expect(content).toContain("Integrating Rundeck Plugins");
      expect(content).toContain("Node step"); // Content capitalizes and spaces the plugin type
      expect(content).toContain("Project"); // Content capitalizes the configuration level
    });
  });

  describe("prompt argument validation", () => {
    it("should validate create-job prompt arguments", () => {
      const prompt = getPrompt("create-job");
      expect(prompt?.argumentSchema).toBeDefined();
      
      if (prompt?.argumentSchema) {
        const validArgs = { job_type: "simple" };
        const result = prompt.argumentSchema.safeParse(validArgs);
        expect(result.success).toBe(true);
        
        const invalidArgs = { job_type: "invalid" };
        const invalidResult = prompt.argumentSchema.safeParse(invalidArgs);
        expect(invalidResult.success).toBe(false);
      }
    });

    it("should validate call-api prompt arguments", () => {
      const prompt = getPrompt("call-api");
      expect(prompt?.argumentSchema).toBeDefined();
      
      if (prompt?.argumentSchema) {
        const validArgs = { endpoint_category: "jobs" };
        const result = prompt.argumentSchema.safeParse(validArgs);
        expect(result.success).toBe(true);
      }
    });

    it("should validate write-node-filter prompt arguments", () => {
      const prompt = getPrompt("write-node-filter");
      expect(prompt?.argumentSchema).toBeDefined();
      
      if (prompt?.argumentSchema) {
        const validArgs = { filter_complexity: "simple" };
        const result = prompt.argumentSchema.safeParse(validArgs);
        expect(result.success).toBe(true);
      }
    });

    it("should validate integrate-plugin prompt arguments", () => {
      const prompt = getPrompt("integrate-plugin");
      expect(prompt?.argumentSchema).toBeDefined();
      
      if (prompt?.argumentSchema) {
        const validArgs = {
          plugin_type: "node-step",
          configuration_level: "project",
        };
        const result = prompt.argumentSchema.safeParse(validArgs);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("prompt examples", () => {
    it("should have examples for prompts that support them", () => {
      const promptsWithExamples = prompts.filter((p) => p.examples && p.examples.length > 0);
      expect(promptsWithExamples.length).toBeGreaterThan(0);
      
      for (const prompt of promptsWithExamples) {
        expect(prompt.examples).toBeDefined();
        expect(Array.isArray(prompt.examples)).toBe(true);
        expect(prompt.examples!.length).toBeGreaterThan(0);
        
        for (const example of prompt.examples!) {
          expect(example.description).toBeDefined();
        }
      }
    });
  });
});

