/**
 * Tests for Resource Model Source management tools
 */

import { jest } from "@jest/globals";
import { rundeckManageResourceSource, rundeckManageResourceSourceSchema } from "../../tools/resources.js";
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

describe("rundeckManageResourceSourceSchema", () => {
  it("requires index for get_source", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({
      action: "get_source",
      project: "demo",
    });
    expect(result.success).toBe(false);
  });

  it("requires project for list_sources", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({ action: "list_sources" });
    expect(result.success).toBe(false);
  });

  it("does not require project for list_provider_types", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({ action: "list_provider_types" });
    expect(result.success).toBe(true);
  });

  it("requires type for describe_provider_config", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({
      action: "describe_provider_config",
      type: "",
    });
    expect(result.success).toBe(false);
  });

  it("does not require project for describe_provider_config", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({
      action: "describe_provider_config",
      type: "ansible",
    });
    expect(result.success).toBe(true);
  });

  it("requires content for set_resources", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({
      action: "set_resources",
      project: "demo",
      index: 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts list_sources with only project", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({
      action: "list_sources",
      project: "demo",
    });
    expect(result.success).toBe(true);
  });

  it("accepts add_source with an arbitrary type and no config at all", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({
      action: "add_source",
      project: "demo",
      type: "node-wizard",
    });
    expect(result.success).toBe(true);
  });

  it("accepts add_source with a free-form type not in any fixed list", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({
      action: "add_source",
      project: "demo",
      type: "aws-ec2",
      config: { region: "us-east-1", accessKey: "storage/aws/key" },
    });
    expect(result.success).toBe(true);
  });

  it("defaults format to 'yaml' when not specified", () => {
    const result = rundeckManageResourceSourceSchema.parse({
      action: "add_source",
      project: "demo",
      type: "file",
      config: { file: "etc/resources.yaml" },
    });
    expect(result.format).toBe("yaml");
  });

  it("requires an explicit type for add_source — no silent default to 'file'", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({
      action: "add_source",
      project: "demo",
      config: { file: "etc/resources.yaml" },
    });
    expect(result.success).toBe(false);
  });

  it("requires config.file when type is 'file' for add_source — a bare 'file' source can corrupt project listing", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({
      action: "add_source",
      project: "demo",
      type: "file",
    });
    expect(result.success).toBe(false);
  });

  it("accepts type 'file' with config.file present", () => {
    const result = rundeckManageResourceSourceSchema.safeParse({
      action: "add_source",
      project: "demo",
      type: "file",
      config: { file: "etc/resources.yaml" },
    });
    expect(result.success).toBe(true);
  });
});

describe("rundeckManageResourceSource", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configManager.setRundeckConnection("https://rundeck.example.com", "test-token");
  });

  it("throws when index is missing for get_source", async () => {
    await expect(
      rundeckManageResourceSource({ action: "get_source", project: "demo" })
    ).rejects.toThrow("'index' is required for action 'get_source'");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when project is missing for list_sources (called directly, bypassing schema)", async () => {
    await expect(rundeckManageResourceSource({ action: "list_sources" })).rejects.toThrow(
      "'project' is required for action 'list_sources'"
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when project is missing for add_source (called directly, bypassing schema)", async () => {
    await expect(
      rundeckManageResourceSource({ action: "add_source", type: "file" })
    ).rejects.toThrow("'project' is required for action 'add_source'");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("list_provider_types calls plugin/list and filters to ResourceModelSource plugins", async () => {
    mockApiResponse([
      { name: "ansible-resource", service: "ResourceModelSource", title: "Ansible Inventory" },
      { name: "WinRMPython", service: "NodeExecutor", title: "WinRM Node Executor" },
      { name: "node-wizard", service: "ResourceModelSource", title: "Node Wizard" },
    ]);

    const result = await rundeckManageResourceSource({ action: "list_provider_types" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("plugin/list");
    const plugins = result.body as Array<{ name: string; service: string }>;
    expect(plugins).toHaveLength(2);
    expect(plugins.map((p) => p.name).sort()).toEqual(["ansible-resource", "node-wizard"]);
  });

  it("list_provider_types does not require or use a project", async () => {
    mockApiResponse([]);

    await rundeckManageResourceSource({ action: "list_provider_types" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("project/");
  });

  it("describe_provider_config calls plugin/detail/ResourceModelSource/{type}", async () => {
    mockApiResponse({
      name: "ansible-resource",
      props: [
        { name: "inventoryFile", type: "String", required: true, defaultValue: "" },
        { name: "hostGroups", type: "String", required: false, defaultValue: "all" },
      ],
    });

    const result = await rundeckManageResourceSource({
      action: "describe_provider_config",
      type: "ansible-resource",
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("plugin/detail/ResourceModelSource/ansible-resource");
    expect((result.body as { props: unknown[] }).props).toHaveLength(2);
  });

  it("throws when type is missing for describe_provider_config", async () => {
    await expect(
      rundeckManageResourceSource({ action: "describe_provider_config", type: "" })
    ).rejects.toThrow("'type' is required for action 'describe_provider_config'");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("lists sources for a project", async () => {
    mockApiResponse([{ index: 1, type: "file", resources: { writeable: true } }]);

    const result = await rundeckManageResourceSource({ action: "list_sources", project: "demo" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("project/demo/sources");
    expect(result.status).toBe(200);
  });

  it("gets a single source by index", async () => {
    mockApiResponse({ index: 2, type: "file" });

    await rundeckManageResourceSource({ action: "get_source", project: "demo", index: 2 });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("project/demo/source/2");
  });

  it("gets resources for a source", async () => {
    mockApiResponse({ "web-01": { hostname: "web-01.internal" } });

    await rundeckManageResourceSource({ action: "get_resources", project: "demo", index: 1 });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("project/demo/source/1/resources");
    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("GET");
  });

  it("set_resources first checks writeable via get_source, then posts the content when true", async () => {
    mockApiResponse({ index: 1, type: "file", resources: { writeable: true } }); // pre-flight get_source
    mockApiResponse({ "web-01": { hostname: "web-01.internal" } }); // POST response

    await rundeckManageResourceSource({
      action: "set_resources",
      project: "demo",
      index: 1,
      format: "yaml",
      content: "web-01:\n  hostname: web-01.internal\n",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [getUrl, getOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(getUrl).toContain("project/demo/source/1");
    expect(getUrl).not.toContain("/resources");
    expect(getOptions.method).toBe("GET");

    const [postUrl, postOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toContain("project/demo/source/1/resources");
    expect(postOptions.method).toBe("POST");
    expect((postOptions.headers as Record<string, string>)["Content-Type"]).toBe("application/yaml");
    expect(postOptions.body).toBe("web-01:\n  hostname: web-01.internal\n");
  });

  it("set_resources fails fast, before POSTing, when get_source reports writeable: false", async () => {
    mockApiResponse({ index: 1, type: "file", resources: { writeable: false } });

    await expect(
      rundeckManageResourceSource({
        action: "set_resources",
        project: "demo",
        index: 1,
        content: "web-01:\n  hostname: web-01.internal\n",
      })
    ).rejects.toThrow(/not writeable \(writeable: false\)/);

    expect(mockFetch).toHaveBeenCalledTimes(1); // only the pre-flight GET — no POST attempted
  });

  it("set_resources proceeds to POST when the pre-flight get_source call is inconclusive (e.g. fails)", async () => {
    mockApiResponse({ message: "not found" }, 404); // pre-flight get_source fails
    mockApiResponse({ "web-01": { hostname: "web-01.internal" } }); // POST still attempted

    await rundeckManageResourceSource({
      action: "set_resources",
      project: "demo",
      index: 1,
      content: "web-01:\n  hostname: web-01.internal\n",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const postOptions = mockFetch.mock.calls[1][1] as RequestInit;
    expect(postOptions.method).toBe("POST");
  });

  it("throws a descriptive error when set_resources' POST itself fails for a different reason", async () => {
    mockApiResponse({ index: 1, type: "file", resources: { writeable: true } }); // pre-flight passes
    mockApiResponse({ message: "malformed content" }, 400); // POST fails anyway

    await expect(
      rundeckManageResourceSource({
        action: "set_resources",
        project: "demo",
        index: 1,
        content: "not valid yaml: [",
      })
    ).rejects.toThrow(/set_resources failed \(HTTP 400\)/);
  });

  it("add_source reads current config, auto-assigns the next index, and PUTs the merged config with free-form config keys", async () => {
    mockApiResponse({ "resources.source.1.type": "file" }); // GET config
    mockApiResponse({}, 200); // PUT config

    const result = await rundeckManageResourceSource({
      action: "add_source",
      project: "demo",
      type: "file",
      config: { file: "etc/resources.yaml", format: "resourceyaml", generateFileAutomatically: "true" },
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [getUrl, getOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(getUrl).toContain("project/demo/config");
    expect(getOptions.method).toBe("GET");

    const [putUrl, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putUrl).toContain("project/demo/config");
    expect(putOptions.method).toBe("PUT");
    const sentBody = JSON.parse(putOptions.body as string);
    expect(sentBody["resources.source.2.type"]).toBe("file");
    expect(sentBody["resources.source.2.config.file"]).toBe("etc/resources.yaml");
    expect(sentBody["resources.source.2.config.format"]).toBe("resourceyaml");
    expect(sentBody["resources.source.2.config.generateFileAutomatically"]).toBe("true");
    expect(sentBody["resources.source.1.type"]).toBe("file"); // preserved existing key

    expect((result.body as { index: number }).index).toBe(2);
  });

  it("add_source starts at index 1 when no sources exist", async () => {
    mockApiResponse({});
    mockApiResponse({}, 200);

    const result = await rundeckManageResourceSource({
      action: "add_source",
      project: "demo",
      type: "file",
      config: { file: "etc/resources.yaml" },
    });

    expect((result.body as { index: number }).index).toBe(1);
  });

  it("add_source with an arbitrary type and no config sets only the type key", async () => {
    mockApiResponse({});
    mockApiResponse({}, 200);

    const result = await rundeckManageResourceSource({
      action: "add_source",
      project: "demo",
      type: "node-wizard",
    });

    const putOptions = mockFetch.mock.calls[1][1] as RequestInit;
    const sentBody = JSON.parse(putOptions.body as string);
    expect(sentBody["resources.source.1.type"]).toBe("node-wizard");
    expect(Object.keys(sentBody).filter((k) => k.startsWith("resources.source.1."))).toEqual([
      "resources.source.1.type",
    ]);
    expect((result.body as { index: number }).index).toBe(1);
  });

  it("add_source passes through arbitrary third-party plugin config keys unmodified", async () => {
    mockApiResponse({});
    mockApiResponse({}, 200);

    await rundeckManageResourceSource({
      action: "add_source",
      project: "demo",
      type: "aws-ec2",
      config: { region: "us-east-1", filterParams: "tag:env=prod" },
    });

    const putOptions = mockFetch.mock.calls[1][1] as RequestInit;
    const sentBody = JSON.parse(putOptions.body as string);
    expect(sentBody["resources.source.1.type"]).toBe("aws-ec2");
    expect(sentBody["resources.source.1.config.region"]).toBe("us-east-1");
    expect(sentBody["resources.source.1.config.filterParams"]).toBe("tag:env=prod");
  });

  it("remove_source strips the target index's keys and renumbers a higher index down to close the gap", async () => {
    mockApiResponse({
      "resources.source.1.type": "file",
      "resources.source.1.config.file": "etc/resources.yaml",
      "resources.source.2.type": "url",
      "resources.source.2.config.url": "http://example.com/nodes.yaml",
    });
    mockApiResponse({}, 200);

    const result = await rundeckManageResourceSource({ action: "remove_source", project: "demo", index: 1 });

    const putOptions = mockFetch.mock.calls[1][1] as RequestInit;
    const sentBody = JSON.parse(putOptions.body as string);
    expect(sentBody).not.toHaveProperty("resources.source.2.type");
    expect(sentBody["resources.source.1.type"]).toBe("url");
    expect(sentBody["resources.source.1.config.url"]).toBe("http://example.com/nodes.yaml");
    expect((result.body as { renumbered: Array<{ from: number; to: number }> }).renumbered).toEqual([
      { from: 2, to: 1 },
    ]);
  });

  it("remove_source closes a gap left in the middle, renumbering only sources above it", async () => {
    mockApiResponse({
      "resources.source.1.type": "file",
      "resources.source.1.config.file": "etc/resources.yaml",
      "resources.source.2.type": "url",
      "resources.source.2.config.url": "http://example.com/nodes.yaml",
      "resources.source.3.type": "node-wizard",
      "some.other.project.property": "unrelated-value",
    });
    mockApiResponse({}, 200);

    const result = await rundeckManageResourceSource({ action: "remove_source", project: "demo", index: 2 });

    const putOptions = mockFetch.mock.calls[1][1] as RequestInit;
    const sentBody = JSON.parse(putOptions.body as string);
    expect(sentBody["resources.source.1.type"]).toBe("file"); // untouched, below the removed index
    expect(sentBody["resources.source.2.type"]).toBe("node-wizard"); // shifted down from 3
    expect(sentBody).not.toHaveProperty("resources.source.3.type");
    expect(sentBody["some.other.project.property"]).toBe("unrelated-value"); // non-source key passes through
    expect((result.body as { renumbered: Array<{ from: number; to: number }> }).renumbered).toEqual([
      { from: 3, to: 2 },
    ]);
  });

  it("throws a descriptive error when reading project config fails", async () => {
    mockApiResponse({ message: "unauthorized" }, 403);

    await expect(
      rundeckManageResourceSource({
        action: "add_source",
        project: "demo",
        type: "file",
        config: { file: "etc/resources.yaml" },
      })
    ).rejects.toThrow(/Failed to read project config \(HTTP 403\)/);
  });
});
