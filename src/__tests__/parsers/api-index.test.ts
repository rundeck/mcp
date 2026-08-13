/**
 * Tests for API index parser
 */

import { parseApiIndex, findEndpointDocumentation } from "../../parsers/api-index.js";

describe("API Index Parser", () => {
  describe("parseApiIndex", () => {
    it("should parse API endpoints from content", () => {
      const content = `# API Reference
[GET /api/59/projects]
List all projects

[POST /api/59/job/{id}/run]
Run a job`;

      const endpoints = parseApiIndex(content);

      expect(endpoints.length).toBeGreaterThan(0);
      expect(endpoints.some((e) => e.path.includes("/projects"))).toBe(true);
      expect(endpoints.some((e) => e.path.includes("/job"))).toBe(true);
    });

    it("should extract method from endpoint", () => {
      const content = `[POST /api/59/projects]
Create a project`;

      const endpoints = parseApiIndex(content);

      expect(endpoints[0].method).toBe("POST");
      expect(endpoints[0].path).toContain("/projects");
    });

    it("should default to GET if no method specified", () => {
      const content = `[/api/59/projects]
List projects`;

      const endpoints = parseApiIndex(content);

      expect(endpoints[0].method).toBe("GET");
    });

    it("should categorize endpoints", () => {
      const content = `[/api/59/job/{id}]
Get job info
[/api/59/project/{name}]
Get project info`;

      const endpoints = parseApiIndex(content);

      const jobEndpoint = endpoints.find((e) => e.path.includes("/job"));
      const projectEndpoint = endpoints.find((e) => e.path.includes("/project"));

      expect(jobEndpoint?.category).toBe("jobs");
      expect(projectEndpoint?.category).toBe("projects");
    });
  });

  describe("findEndpointDocumentation", () => {
    it("should find documentation for endpoint", () => {
      const content = `# API Docs
## Job Endpoints
[/api/59/job/{id}/run]
Run a job with the given ID
This endpoint accepts options in the request body.`;

      const result = findEndpointDocumentation(content, "/api/59/job/{id}/run");

      expect(result).not.toBeNull();
      expect(result).toContain("/api/59/job/{id}/run");
      expect(result).toContain("Run a job");
    });

    it("should return null for non-existent endpoint", () => {
      const content = `# API Docs
[/api/59/projects]
List projects`;

      const result = findEndpointDocumentation(
        content,
        "/api/59/nonexistent"
      );

      expect(result).toBeNull();
    });
  });
});


