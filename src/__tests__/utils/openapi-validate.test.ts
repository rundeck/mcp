/**
 * Tests for OpenAPI-derived api_call validation
 */

import {
  normalizeEndpointToOpenApiPath,
  templateMatches,
  findOpenApiOperation,
  validateOpenApiRequest,
} from "../../utils/openapi-validate.js";

const miniSpec = {
  paths: {
    "/projects": {
      get: {
        parameters: [
          {
            name: "meta",
            in: "query",
            schema: { type: "string" },
          },
        ],
      },
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  config: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
    "/job/{id}/run": {
      post: {
        parameters: [
          {
            name: "argString",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "option.OPTNAME",
            in: "query",
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  argString: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
} as unknown as Record<string, unknown>;

describe("openapi-validate helpers", () => {
  it("normalizes URLs and strips /api/version prefix", () => {
    expect(normalizeEndpointToOpenApiPath("projects")).toBe("/projects");
    expect(normalizeEndpointToOpenApiPath("/projects")).toBe("/projects");
    expect(normalizeEndpointToOpenApiPath("/api/59/projects")).toBe("/projects");
    expect(normalizeEndpointToOpenApiPath("https://rd.example/api/52/job/x/run")).toBe("/job/x/run");
  });

  it("matches path templates including path params", () => {
    expect(templateMatches("/job/{id}/run", "/job/foo/run")).toBe(true);
    expect(templateMatches("/job/{id}/run", "/job/foo/miss")).toBe(false);
  });

  it("findOperation picks longest matching path", () => {
    const spec = {
      paths: {
        "/a/{x}": { get: { operationId: "short" } },
        "/a/{x}/nested": { get: { operationId: "long" } },
      },
    } as unknown as Record<string, unknown>;
    const hit = findOpenApiOperation(spec, "GET", "/a/z/nested");
    expect(hit?.pathTemplate).toBe("/a/{x}/nested");
    expect((hit?.operation.operationId as string) || "").toBe("long");
  });
});

describe("validateOpenApiRequest (mini fixture)", () => {
  it("rejects unknown query params", () => {
    const r = validateOpenApiRequest(miniSpec, {
      method: "GET",
      endpoint: "/projects",
      query_params: { potato: "x" },
    });
    expect(r.ok).toBe(false);
    expect(r.message || "").toMatch(/potato/i);
  });

  it("accepts declared query params", () => {
    const r = validateOpenApiRequest(miniSpec, {
      method: "GET",
      endpoint: "/projects",
      query_params: { meta: "*" },
    });
    expect(r.ok).toBe(true);
  });

  it("allows option.* query aliases", () => {
    const r = validateOpenApiRequest(miniSpec, {
      method: "POST",
      endpoint: "/job/j1/run",
      query_params: { "option.region": "us-east-1" },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects unknown top-level JSON body keys when schema declares properties", () => {
    const r = validateOpenApiRequest(miniSpec, {
      method: "POST",
      endpoint: "/projects",
      body: { name: "p", potato: true },
    });
    expect(r.ok).toBe(false);
    expect(r.message || "").toMatch(/potato/i);
  });

  it("allows body keys declared in schema", () => {
    const r = validateOpenApiRequest(miniSpec, {
      method: "POST",
      endpoint: "/projects",
      body: { name: "p", config: { k: "v" } },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects query params when POST declares none", () => {
    const r = validateOpenApiRequest(miniSpec, {
      method: "POST",
      endpoint: "/projects",
      query_params: { debug: "1" },
      body: { name: "p" },
    });
    expect(r.ok).toBe(false);
    expect(r.message || "").toMatch(/debug/i);
  });
});
