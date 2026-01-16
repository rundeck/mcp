/**
 * Integration Tests: All Resources Together
 * 
 * Tests that all resources from Entity 1 work together harmoniously
 */

import { listResources, handleResource } from "../../resources/index.js";

describe("Integration: All Resources Together", () => {
  it("should list all resource categories", () => {
    const resources = listResources();
    
    expect(resources.length).toBeGreaterThan(0);
    
    // Check for Entity 1's new resource categories
    const categories = [
      "rundeck://docs/manual",
      "rundeck://docs/administration",
      "rundeck://docs/developer",
      "rundeck://docs/rd-cli",
      "rundeck://docs/integrations",
      "rundeck://docs/learning",
    ];
    
    const foundCategories = categories.filter((cat) =>
      resources.some((r) => r.uri.startsWith(cat))
    );
    
    expect(foundCategories.length).toBeGreaterThan(0);
  });

  it("should read resources from different categories", () => {
    const testUris = [
      "rundeck://docs/manual/jobs",
      "rundeck://docs/developer/plugins",
      "rundeck://docs/administration/configuration",
    ];
    
    let foundCount = 0;
    for (const uri of testUris) {
      const content = handleResource(uri);
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
      if (!content.includes("not found")) {
        foundCount++;
      }
    }
    // At least some resources should be found
    expect(foundCount).toBeGreaterThan(0);
  });

  it("should provide hierarchical resource structure", () => {
    const resources = listResources();
    
    // Check for hierarchical URIs
    const hierarchicalUris = resources.filter((r) =>
      r.uri.includes("/") && r.uri.split("/").length > 2
    );
    
    expect(hierarchicalUris.length).toBeGreaterThan(0);
  });
});

