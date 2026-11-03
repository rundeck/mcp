import { jest } from "@jest/globals";
import { configManager } from "../../config.js";
import {
  discoverRundeckAuth,
  isRundeckIssuerDiscoveryEnabled,
  parseRundeckMetadata,
  rundeckMetadataUrls,
} from "../../http/rundeck-auth-discovery.js";

const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch as unknown as typeof fetch;

const ENV_KEYS = [
  "RUNDECK_URL",
  "MCP_OAUTH_ISSUER_DISCOVERY",
  "MCP_OAUTH_ALLOWED_ISSUERS",
  "MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL",
];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const RUNDECK = new URL("https://rundeck.example.com");
const METADATA = {
  resource: "https://rundeck.example.com",
  authorization_servers: ["https://idp.example.com/realms/rundeck/"],
  scopes_supported: ["openid", "profile"],
};

describe("rundeck auth discovery", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    mockFetch.mockReset();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    jest.restoreAllMocks();
  });

  function useRundeckUrl(url: string): void {
    jest.spyOn(configManager, "getConfig").mockReturnValue({
      ...configManager.getConfig(),
      rundeckUrl: url,
    });
  }

  it("is opt-in via MCP_OAUTH_ISSUER_DISCOVERY=rundeck", () => {
    expect(isRundeckIssuerDiscoveryEnabled()).toBe(false);
    process.env.MCP_OAUTH_ISSUER_DISCOVERY = "Rundeck";
    expect(isRundeckIssuerDiscoveryEnabled()).toBe(true);
  });

  it("tries the path-inserted metadata URL before the origin root", () => {
    expect(rundeckMetadataUrls(new URL("https://rd.example.com/rundeck/"))).toEqual([
      "https://rd.example.com/.well-known/oauth-protected-resource/rundeck",
      "https://rd.example.com/.well-known/oauth-protected-resource",
    ]);
    expect(rundeckMetadataUrls(RUNDECK)).toEqual([
      "https://rundeck.example.com/.well-known/oauth-protected-resource",
    ]);
  });

  it("returns the first authorization server and its scopes", () => {
    const result = parseRundeckMetadata(METADATA, RUNDECK, "m");
    expect(result.issuer).toBe("https://idp.example.com/realms/rundeck");
    expect(result.scopes).toEqual(["openid", "profile"]);
  });

  it("rejects metadata for a resource on another origin", () => {
    expect(() =>
      parseRundeckMetadata({ ...METADATA, resource: "https://evil.example.com" }, RUNDECK, "m")
    ).toThrow(/does not match RUNDECK_URL/);
  });

  it("rejects metadata without authorization servers", () => {
    expect(() =>
      parseRundeckMetadata({ ...METADATA, authorization_servers: [] }, RUNDECK, "m")
    ).toThrow(/no authorization_servers/);
  });

  it("rejects a plain-http issuer unless insecure URLs are allowed", () => {
    const doc = { ...METADATA, authorization_servers: ["http://localhost:8080/realms/dev"] };
    expect(() => parseRundeckMetadata(doc, RUNDECK, "m")).toThrow(/must use https/);
    process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL = "1";
    expect(parseRundeckMetadata(doc, RUNDECK, "m").issuer).toBe("http://localhost:8080/realms/dev");
  });

  it("enforces MCP_OAUTH_ALLOWED_ISSUERS when set", () => {
    process.env.MCP_OAUTH_ALLOWED_ISSUERS = "https://other.example.com";
    expect(() => parseRundeckMetadata(METADATA, RUNDECK, "m")).toThrow(/MCP_OAUTH_ALLOWED_ISSUERS/);
    process.env.MCP_OAUTH_ALLOWED_ISSUERS = "https://idp.example.com/realms/rundeck/";
    expect(parseRundeckMetadata(METADATA, RUNDECK, "m").issuer).toBe(
      "https://idp.example.com/realms/rundeck"
    );
  });

  it("fetches metadata from RUNDECK_URL without following redirects", async () => {
    useRundeckUrl("https://rundeck.example.com");
    mockFetch.mockResolvedValueOnce(jsonResponse(200, METADATA));

    const result = await discoverRundeckAuth();

    expect(result.issuer).toBe("https://idp.example.com/realms/rundeck");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://rundeck.example.com/.well-known/oauth-protected-resource");
    expect((init as RequestInit).redirect).toBe("error");
  });

  it("falls back to the origin root when the path-inserted URL is missing", async () => {
    useRundeckUrl("https://rundeck.example.com/rundeck");
    mockFetch
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(200, METADATA));

    const result = await discoverRundeckAuth();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.metadataUrl).toBe(
      "https://rundeck.example.com/.well-known/oauth-protected-resource"
    );
  });

  it("explains how to recover when Rundeck publishes no metadata", async () => {
    useRundeckUrl("https://rundeck.example.com");
    mockFetch.mockResolvedValueOnce(jsonResponse(404, {}));

    await expect(discoverRundeckAuth()).rejects.toThrow(/Set OIDC_ISSUER instead/);
  });

  it("refuses a plain-http RUNDECK_URL by default", async () => {
    useRundeckUrl("http://localhost:4440");

    await expect(discoverRundeckAuth()).rejects.toThrow(/RUNDECK_URL must use https/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
