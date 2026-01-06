/**
 * Integration Tests: Prompts Integration
 * 
 * Tests that prompts from Entity 3 work with tools and resources
 */

import { prompts, getPrompt } from "../../prompts/index.js";

describe("Integration: Prompts Integration", () => {
  it("should list all prompts", () => {
    expect(prompts.length).toBe(6);
    
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
  });

  it("should retrieve prompts by name", () => {
    const createJobPrompt = getPrompt("create-job");
    expect(createJobPrompt).toBeDefined();
    expect(createJobPrompt?.name).toBe("create-job");
    
    const callApiPrompt = getPrompt("call-api");
    expect(callApiPrompt).toBeDefined();
    expect(callApiPrompt?.name).toBe("call-api");
  });

  it("should generate prompt content with arguments", () => {
    const createJobPrompt = getPrompt("create-job");
    expect(createJobPrompt).toBeDefined();
    
    const content = createJobPrompt?.getContent({ job_type: "multi-step" });
    expect(content).toBeDefined();
    expect(content).toContain("Creating a Rundeck Job");
    expect(content).toContain("multi-step");
  });

  it("should reference current tools in prompt content", () => {
    const createJobPrompt = getPrompt("create-job");
    const content = createJobPrompt?.getContent({});
    
    expect(content).toBeDefined();
    // Should reference job_create (not deprecated job_template)
    expect(content).toContain("job_create");
    expect(content).not.toContain("job_template");
  });

  it("should reference current authentication method in prompts", () => {
    const setupAuthPrompt = getPrompt("setup-authentication");
    const content = setupAuthPrompt?.getContent({});
    
    expect(content).toBeDefined();
    // Should reference environment variables (not deprecated auth_setup)
    expect(content).toContain("environment variables");
    expect(content).not.toContain("auth_setup");
  });
});

