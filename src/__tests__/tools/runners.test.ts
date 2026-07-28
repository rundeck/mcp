/**
 * Tests for runner management tools
 */

import { jest } from "@jest/globals";
import { rundeckCreateRunner } from "../../tools/runners.js";
import { configManager } from "../../config.js";

const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch as unknown as typeof fetch;

function mockApiResponse(body: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

const RUNNER_BODY = {
  runnerId: "abc-123",
  name: "test-runner",
  token: "one-time-token",
  downloadTk: "dl-token",
  filename: "runner-abc-123.jar",
  projectAssociations: { "my-project": ".*" },
  replicaId: null,
};

describe("rundeckCreateRunner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configManager.setRundeckConnection("https://rundeck.example.com", "test-token");
  });

  it("uses project-scoped endpoint when scope is project", async () => {
    mockApiResponse(RUNNER_BODY);

    await rundeckCreateRunner({
      name: "test-runner",
      scope: "project",
      project: "my-project",
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("project/my-project/runnerManagement/runners");
  });

  it("uses system-scoped endpoint when scope is system", async () => {
    mockApiResponse(RUNNER_BODY);

    await rundeckCreateRunner({ name: "global-runner", scope: "system" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("runnerManagement/runners");
    expect(calledUrl).not.toContain("project/");
  });

  it("throws when scope is project but project is not provided", async () => {
    await expect(
      rundeckCreateRunner({ name: "test", scope: "project" })
    ).rejects.toThrow("'project' is required when scope is 'project'");

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("defaults replica_type to ephemeral and installation_type to docker", async () => {
    mockApiResponse(RUNNER_BODY);

    await rundeckCreateRunner({ name: "test-runner", scope: "system" });

    const sentBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(sentBody.replicaType).toBe("ephemeral");
    expect(sentBody.installationType).toBe("docker");
  });

  it.each([
    ["linux", "manual"],
    ["windows", "manual"],
    ["docker", "ephemeral"],
    ["kubernetes", "ephemeral"],
  ] as const)(
    "defaults replica_type to %s -> %s when omitted, matching Rundeck's own behavior",
    async (installationType, expectedReplicaType) => {
      mockApiResponse(RUNNER_BODY);

      await rundeckCreateRunner({
        name: "test-runner",
        scope: "system",
        installation_type: installationType,
      });

      const sentBody = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(sentBody.replicaType).toBe(expectedReplicaType);
      expect(sentBody.installationType).toBe(installationType);
    }
  );

  it("passes optional fields in the body", async () => {
    mockApiResponse(RUNNER_BODY);

    await rundeckCreateRunner({
      name: "tagged-runner",
      scope: "system",
      description: "A test runner",
      replica_type: "manual",
      installation_type: "kubernetes",
      tag_names: ["PROD", "US-EAST"],
    });

    const sentBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(sentBody.description).toBe("A test runner");
    expect(sentBody.replicaType).toBe("manual");
    expect(sentBody.installationType).toBe("kubernetes");
    expect(sentBody.tagNames).toEqual(["PROD", "US-EAST"]);
  });

  it("throws on non-200 API response", async () => {
    mockApiResponse({ error: true, message: "Runner name already exists" }, 409);

    await expect(
      rundeckCreateRunner({ name: "dup-runner", scope: "system" })
    ).rejects.toThrow("Runner creation failed (HTTP 409)");
  });

  it("returns the runner creation result", async () => {
    mockApiResponse(RUNNER_BODY);

    const result = await rundeckCreateRunner({
      name: "test-runner",
      scope: "project",
      project: "my-project",
    });

    expect(result.runnerId).toBe("abc-123");
    expect(result.token).toBe("one-time-token");
    expect(result.downloadTk).toBe("dl-token");
  });

  describe("node_dispatch", () => {
    it("throws when node_dispatch is provided but scope is system", async () => {
      await expect(
        rundeckCreateRunner({
          name: "test-runner",
          scope: "system",
          node_dispatch: { remote_node_dispatch: true, node_filter: "tags: LINUX" },
        })
      ).rejects.toThrow("'node_dispatch' requires scope 'project' and a 'project' value");

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends a follow-up call to the Node Dispatch config endpoint", async () => {
      mockApiResponse(RUNNER_BODY);
      mockApiResponse({ ...RUNNER_BODY, remoteNodeDispatch: true, runnerNodeFilter: "tags: LINUX" });

      await rundeckCreateRunner({
        name: "test-runner",
        scope: "project",
        project: "my-project",
        installation_type: "linux",
        node_dispatch: { remote_node_dispatch: true, node_filter: "tags: LINUX" },
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const secondCallUrl = mockFetch.mock.calls[1][0] as string;
      expect(secondCallUrl).toContain("project/my-project/runnerManagement/nodeDispatch/config");

      const secondCallBody = JSON.parse(
        (mockFetch.mock.calls[1][1] as RequestInit).body as string
      );
      expect(secondCallBody).toEqual({
        runnerId: "abc-123",
        runnerAsNodeEnabled: true,
        remoteNodeDispatch: true,
        runnerNodeFilter: "tags: LINUX",
      });
    });

    it("defaults runner_as_node_enabled to true when omitted", async () => {
      mockApiResponse(RUNNER_BODY);
      mockApiResponse(RUNNER_BODY);

      await rundeckCreateRunner({
        name: "test-runner",
        scope: "project",
        project: "my-project",
        node_dispatch: { node_filter: "tags: LINUX" },
      });

      const secondCallBody = JSON.parse(
        (mockFetch.mock.calls[1][1] as RequestInit).body as string
      );
      expect(secondCallBody.runnerAsNodeEnabled).toBe(true);
      expect(secondCallBody.runnerNodeFilter).toBe("tags: LINUX");
      expect(secondCallBody.remoteNodeDispatch).toBeUndefined();
    });

    it("merges the Node Dispatch response into the returned result", async () => {
      mockApiResponse(RUNNER_BODY);
      const nodeDispatchBody = { ...RUNNER_BODY, remoteNodeDispatch: true };
      mockApiResponse(nodeDispatchBody);

      const result = await rundeckCreateRunner({
        name: "test-runner",
        scope: "project",
        project: "my-project",
        node_dispatch: { remote_node_dispatch: true },
      });

      expect(result.nodeDispatch).toEqual(nodeDispatchBody);
    });

    it("returns the created runner with an embedded error when the Node Dispatch follow-up call fails", async () => {
      mockApiResponse(RUNNER_BODY);
      const failureBody = { error: true, message: "runnerAsNodeEnabled is required" };
      mockApiResponse(failureBody, 400);

      const result = await rundeckCreateRunner({
        name: "test-runner",
        scope: "project",
        project: "my-project",
        node_dispatch: { remote_node_dispatch: true },
      });

      // The runner was already created — its one-time token/downloadTk must still be returned.
      expect(result.runnerId).toBe("abc-123");
      expect(result.token).toBe("one-time-token");
      expect(result.downloadTk).toBe("dl-token");
      expect(result.nodeDispatchError).toEqual({ status: 400, body: failureBody });
      expect(result.nodeDispatch).toBeUndefined();
    });
  });
});