/**
 * Tests for ACL policy tools
 */

import { jest } from "@jest/globals";
import { rundeckValidateAcl, rundeckManageAcl } from "../../tools/acl.js";
import { configManager } from "../../config.js";

const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch as unknown as typeof fetch;

function mockApiResponse(body: unknown, status = 200, contentType = "application/json") {
  mockFetch.mockResolvedValueOnce({
    status,
    headers: new Headers({ "content-type": contentType }),
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response);
}

const VALID_POLICY = `description: Admin project level access
context:
  project: '.*'
for:
  job:
    - allow: [create, read, update, delete]
by:
  group: admin`;

describe("rundeckValidateAcl", () => {
  it("accepts a well-formed policy", () => {
    const result = rundeckValidateAcl({ acl_definition: VALID_POLICY });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.policyCount).toBe(1);
  });

  it("flags invalid YAML syntax", () => {
    const result = rundeckValidateAcl({ acl_definition: "description: [unterminated" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /YAML/.test(e))).toBe(true);
  });

  it("requires a context section", () => {
    const result = rundeckValidateAcl({
      acl_definition: `description: no context\nfor:\n  job:\n    - allow: read\nby:\n  group: admin`,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /context/.test(e))).toBe(true);
  });

  it("rejects context with both project and application", () => {
    const result = rundeckValidateAcl({
      acl_definition: `description: bad context\ncontext:\n  project: '.*'\n  application: rundeck\nfor:\n  job:\n    - allow: read\nby:\n  group: admin`,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /only one of/.test(e))).toBe(true);
  });

  it("requires a for section with at least one rule", () => {
    const result = rundeckValidateAcl({
      acl_definition: `description: empty for\ncontext:\n  project: '.*'\nfor: {}\nby:\n  group: admin`,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /'for' section is empty/.test(e))).toBe(true);
  });

  it("requires each rule to declare allow or deny", () => {
    const result = rundeckValidateAcl({
      acl_definition: `description: no action\ncontext:\n  project: '.*'\nfor:\n  job:\n    - match:\n        name: '.*'\nby:\n  group: admin`,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /allow.*and\/or.*deny/.test(e))).toBe(true);
  });

  it("requires a by or notBy section", () => {
    const result = rundeckValidateAcl({
      acl_definition: `description: no subject\ncontext:\n  project: '.*'\nfor:\n  job:\n    - allow: read`,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /'by' \(or 'notBy'\)/.test(e))).toBe(true);
  });

  it("warns (but does not error) when a rule has no match clause", () => {
    const result = rundeckValidateAcl({ acl_definition: VALID_POLICY });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => /no match\/equals\/contains\/subset/.test(w))).toBe(true);
  });

  it("handles multi-document policies separated by ---", () => {
    const multi = `${VALID_POLICY}\n---\ndescription: App level\ncontext:\n  application: rundeck\nfor:\n  resource:\n    - equals:\n        kind: system\n      allow: read\nby:\n  group: admin`;
    const result = rundeckValidateAcl({ acl_definition: multi });
    expect(result.valid).toBe(true);
    expect(result.policyCount).toBe(2);
  });
});

describe("rundeckManageAcl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configManager.setRundeckConnection("https://rundeck.example.com", "test-token");
  });

  it("throws when scope is project but project is missing", async () => {
    await expect(
      rundeckManageAcl({ action: "list", scope: "project" })
    ).rejects.toThrow("'project' is required when scope is 'project'");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when name is missing for a non-list action", async () => {
    await expect(
      rundeckManageAcl({ action: "get", scope: "system" })
    ).rejects.toThrow("'name' is required for action 'get'");
  });

  it("throws when content is missing for create", async () => {
    await expect(
      rundeckManageAcl({ action: "create", scope: "system", name: "admin" })
    ).rejects.toThrow("'content' (ACL policy YAML) is required for action 'create'");
  });

  it("lists system-scoped policies with a trailing-slash endpoint", async () => {
    mockApiResponse({ resources: [] });

    await rundeckManageAcl({ action: "list", scope: "system" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("system/acl/");
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("GET");
  });

  it("uses the project-scoped endpoint when scope is project", async () => {
    mockApiResponse({ resources: [] });

    await rundeckManageAcl({ action: "list", scope: "project", project: "my-project" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("project/my-project/acl/");
  });

  it("appends .aclpolicy to the name automatically", async () => {
    mockApiResponse({ contents: VALID_POLICY });

    await rundeckManageAcl({ action: "get", scope: "system", name: "admin" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("system/acl/admin.aclpolicy");
  });

  it("does not double-append .aclpolicy when already present", async () => {
    mockApiResponse({ contents: VALID_POLICY });

    await rundeckManageAcl({ action: "get", scope: "system", name: "admin.aclpolicy" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("system/acl/admin.aclpolicy");
    expect(calledUrl).not.toContain("admin.aclpolicy.aclpolicy");
  });

  it("sends content wrapped as { contents } on create", async () => {
    mockApiResponse({ contents: VALID_POLICY }, 201);

    await rundeckManageAcl({
      action: "create",
      scope: "system",
      name: "admin",
      content: VALID_POLICY,
    });

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("POST");
    const sentBody = JSON.parse(options.body as string);
    expect(sentBody.contents).toBe(VALID_POLICY);
  });

  it("uses PUT for update", async () => {
    mockApiResponse({ contents: VALID_POLICY }, 200);

    await rundeckManageAcl({
      action: "update",
      scope: "system",
      name: "admin",
      content: VALID_POLICY,
    });

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("PUT");
  });

  it("uses DELETE and expects 204", async () => {
    mockApiResponse(undefined, 204, "text/plain");

    const result = await rundeckManageAcl({ action: "delete", scope: "system", name: "admin" });
    expect(result.status).toBe(204);
  });

  it("throws a descriptive error when the server rejects a create with 400", async () => {
    mockApiResponse(
      { valid: false, policies: [{ policy: "admin.aclpolicy[1]", errors: ["reason"] }] },
      400
    );

    await expect(
      rundeckManageAcl({
        action: "create",
        scope: "system",
        name: "admin",
        content: VALID_POLICY,
      })
    ).rejects.toThrow(/ACL create failed \(HTTP 400, expected 201\)/);
  });

  it("throws when create conflicts with an existing policy (409)", async () => {
    mockApiResponse({ message: "already exists" }, 409);

    await expect(
      rundeckManageAcl({
        action: "create",
        scope: "system",
        name: "admin",
        content: VALID_POLICY,
      })
    ).rejects.toThrow(/HTTP 409/);
  });

  it("returns the response body on success", async () => {
    mockApiResponse({ contents: VALID_POLICY }, 200);

    const result = await rundeckManageAcl({ action: "get", scope: "system", name: "admin" });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ contents: VALID_POLICY });
  });
});
