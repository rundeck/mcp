import { jest } from "@jest/globals";
import {
  clearCimdCache,
  cimdAllowedHosts,
  fetchClientMetadataDocument,
  isCimdClientId,
  isCimdHostAllowed,
  isPrivateAddress,
  parseClientMetadataDocument,
  setDiscoveredCimdAllowedHosts,
} from "../../http/cimd.js";
import {
  checkTokenRequest,
  handleOAuthAuthorize,
  handleOAuthCallback,
  type McpOAuthRuntime,
} from "../../http/mcp-oauth.js";

const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const FORM = "application/x-www-form-urlencoded";

function docResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const publicResolve = async () => ["160.79.104.10"];

function okFetch(body: unknown = { client_id: CLIENT, redirect_uris: [REDIRECT] }) {
  return jest.fn(async () => docResponse(body)) as unknown as typeof fetch;
}

const savedEnv = { ...process.env };

beforeEach(() => {
  clearCimdCache();
  setDiscoveredCimdAllowedHosts(undefined);
  process.env.MCP_OAUTH_CIMD_ALLOWED_HOSTS = "claude.ai";
  process.env.MCP_OAUTH_CLIENT_ID = "rundeck-mcp";
  delete process.env.MCP_OAUTH_CIMD;
  delete process.env.MCP_OAUTH_CIMD_DANGEROUSLY_ALLOW_PRIVATE;
  delete process.env.MCP_OAUTH_PROXY_TOKEN;
});

afterAll(() => {
  process.env = savedEnv;
});

describe("CIMD client ids and hosts", () => {
  it("recognizes https URLs with a path as client ids", () => {
    expect(isCimdClientId(CLIENT)).toBe(true);
    expect(isCimdClientId("https://claude.ai/")).toBe(false);
    expect(isCimdClientId("http://claude.ai/meta")).toBe(false);
    expect(isCimdClientId("rundeck-mcp")).toBe(false);
    expect(isCimdClientId("https://user:pw@claude.ai/meta")).toBe(false);
  });

  it("matches exact hosts and wildcard subdomains", () => {
    expect(isCimdHostAllowed("claude.ai", ["claude.ai"])).toBe(true);
    expect(isCimdHostAllowed("evil.ai", ["claude.ai"])).toBe(false);
    expect(isCimdHostAllowed("a.example.com", ["*.example.com"])).toBe(true);
    expect(isCimdHostAllowed("example.com", ["*.example.com"])).toBe(false);
    expect(isCimdHostAllowed("notexample.com", ["*.example.com"])).toBe(false);
  });

  it("uses the env allowlist over the one Rundeck publishes", () => {
    setDiscoveredCimdAllowedHosts(["from-rundeck.example"]);
    expect(cimdAllowedHosts()).toEqual(["claude.ai"]);
    delete process.env.MCP_OAUTH_CIMD_ALLOWED_HOSTS;
    expect(cimdAllowedHosts()).toEqual(["from-rundeck.example"]);
    process.env.MCP_OAUTH_CIMD_ALLOWED_HOSTS = "";
    expect(cimdAllowedHosts()).toEqual([]);
  });

  it("flags private, loopback and link-local addresses", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "192.168.1.1", "172.20.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("160.79.104.10")).toBe(false);
    expect(isPrivateAddress("2607:6bc0::10")).toBe(false);
  });
});

describe("fetchClientMetadataDocument", () => {
  it("accepts a valid document and caches it", async () => {
    const fetchImpl = okFetch();
    const doc = await fetchClientMetadataDocument(CLIENT, { fetchImpl, resolve: publicResolve });
    expect(doc.redirect_uris).toEqual([REDIRECT]);
    await fetchClientMetadataDocument(CLIENT, { fetchImpl, resolve: publicResolve });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses hosts that are not allowed", async () => {
    await expect(
      fetchClientMetadataDocument("https://evil.example/meta", { fetchImpl: okFetch(), resolve: publicResolve })
    ).rejects.toThrow(/not allowed/);
  });

  it("refuses hosts that resolve to private addresses", async () => {
    const fetchImpl = okFetch();
    await expect(
      fetchClientMetadataDocument(CLIENT, { fetchImpl, resolve: async () => ["160.79.104.10", "10.0.0.5"] })
    ).rejects.toThrow(/private/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses redirects and oversized documents", async () => {
    const redirectFetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      throw new TypeError("redirect mode is set to error");
    }) as unknown as typeof fetch;
    await expect(
      fetchClientMetadataDocument(CLIENT, { fetchImpl: redirectFetch, resolve: publicResolve })
    ).rejects.toThrow(/redirect/);

    const big = { client_id: CLIENT, redirect_uris: [REDIRECT], padding: "x".repeat(10_000) };
    await expect(
      fetchClientMetadataDocument(CLIENT, { fetchImpl: okFetch(big), resolve: publicResolve })
    ).rejects.toThrow(/larger than/);
  });

  it("requires the document client_id to equal its URL", () => {
    expect(() =>
      parseClientMetadataDocument({ client_id: "https://claude.ai/other", redirect_uris: [REDIRECT] }, CLIENT)
    ).toThrow(/does not match/);
    expect(() => parseClientMetadataDocument({ client_id: CLIENT }, CLIENT)).toThrow(/redirect_uris/);
    expect(() =>
      parseClientMetadataDocument(
        { client_id: CLIENT, redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" },
        CLIENT
      )
    ).toThrow(/not supported/);
  });
});

function runtime(): McpOAuthRuntime {
  return {
    authMetadata: {
      oauthMetadata: {
        issuer: "https://mcp.example.com",
        authorization_endpoint: "https://mcp.example.com/oauth/authorize",
        token_endpoint: "https://mcp.example.com/oauth/token",
        response_types_supported: ["code"],
      },
      resourceServerUrl: new URL("https://mcp.example.com/mcp"),
    },
    resourceMetadataUrl: "https://mcp.example.com/.well-known/oauth-protected-resource/mcp",
    verifier: { verifyAccessToken: async () => ({ token: "t", clientId: "c", scopes: [] }) },
    upstreamTokenEndpoint: "https://idp.example.com/token",
    upstreamAuthorizationEndpoint: "https://idp.example.com/auth",
    callbackUrl: "https://mcp.example.com/oauth/callback",
    registeredClientId: "rundeck-mcp",
    dcrEnabled: false,
  };
}

function authorizeUrl(clientId: string, redirectUri: string, pkce = true): URL {
  const url = new URL("https://mcp.example.com/oauth/authorize?response_type=code&state=s1");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  if (pkce) {
    url.searchParams.set("code_challenge", "challenge");
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url;
}

/** Runs authorize + callback and returns the code handed back to the client. */
async function codeFor(clientId: string, redirectUri: string, code: string): Promise<void> {
  const rt = runtime();
  const authorize = await handleOAuthAuthorize(authorizeUrl(clientId, redirectUri), rt, {
    fetchImpl: okFetch(),
    resolve: publicResolve,
  });
  expect(authorize.status).toBe(302);
  const key = new URL(authorize.headers.get("Location")!).searchParams.get("state")!;
  handleOAuthCallback(new URL(`https://mcp.example.com/oauth/callback?code=${code}&state=${key}`), rt);
}

function form(params: Record<string, string>): Buffer {
  return Buffer.from(new URLSearchParams(params).toString());
}

describe("CIMD authorize", () => {
  it("sends a CIMD client to the IdP as the MCP's registered client", async () => {
    const res = await handleOAuthAuthorize(authorizeUrl(CLIENT, REDIRECT), runtime(), {
      fetchImpl: okFetch(),
      resolve: publicResolve,
    });
    expect(res.status).toBe(302);
    const upstream = new URL(res.headers.get("Location")!);
    expect(upstream.searchParams.get("client_id")).toBe("rundeck-mcp");
    expect(upstream.searchParams.get("redirect_uri")).toBe("https://mcp.example.com/oauth/callback");
    expect(upstream.searchParams.get("code_challenge")).toBe("challenge");
  });

  it("rejects a redirect_uri the document does not list", async () => {
    const res = await handleOAuthAuthorize(authorizeUrl(CLIENT, "https://claude.ai/elsewhere"), runtime(), {
      fetchImpl: okFetch(),
      resolve: publicResolve,
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/not registered/);
  });

  it("rejects CIMD clients when CIMD is off", async () => {
    process.env.MCP_OAUTH_CIMD = "0";
    const res = await handleOAuthAuthorize(authorizeUrl(CLIENT, REDIRECT), runtime(), {
      fetchImpl: okFetch(),
      resolve: publicResolve,
    });
    expect(res.status).toBe(400);
  });

  it("requires PKCE", async () => {
    const res = await handleOAuthAuthorize(authorizeUrl(CLIENT, REDIRECT, false), runtime());
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/PKCE/);
  });

  it("still accepts loopback clients such as Claude Code", async () => {
    const res = await handleOAuthAuthorize(
      authorizeUrl("rundeck-mcp", "http://localhost:54545/callback"),
      runtime()
    );
    expect(res.status).toBe(302);
  });
});

describe("checkTokenRequest", () => {
  it("binds the code to the CIMD client and swaps in the registered client id", async () => {
    await codeFor(CLIENT, REDIRECT, "code-1");
    const checked = checkTokenRequest(
      form({ grant_type: "authorization_code", code: "code-1", client_id: CLIENT, redirect_uri: REDIRECT, code_verifier: "v" }),
      FORM,
      "rundeck-mcp"
    );
    expect(checked).toBeInstanceOf(Buffer);
    expect(new URLSearchParams((checked as Buffer).toString()).get("client_id")).toBe("rundeck-mcp");
  });

  it("rejects a mismatched client_id, redirect_uri or missing verifier", async () => {
    await codeFor(CLIENT, REDIRECT, "code-2");
    const wrongClient = checkTokenRequest(
      form({ grant_type: "authorization_code", code: "code-2", client_id: "https://claude.ai/x", redirect_uri: REDIRECT, code_verifier: "v" }),
      FORM,
      "rundeck-mcp"
    );
    expect((wrongClient as Response).status).toBe(400);

    await codeFor(CLIENT, REDIRECT, "code-3");
    const wrongRedirect = checkTokenRequest(
      form({ grant_type: "authorization_code", code: "code-3", client_id: CLIENT, redirect_uri: "https://claude.ai/x", code_verifier: "v" }),
      FORM,
      "rundeck-mcp"
    );
    expect((wrongRedirect as Response).status).toBe(400);

    await codeFor(CLIENT, REDIRECT, "code-4");
    const noVerifier = checkTokenRequest(
      form({ grant_type: "authorization_code", code: "code-4", client_id: CLIENT, redirect_uri: REDIRECT }),
      FORM,
      "rundeck-mcp"
    );
    expect(await (noVerifier as Response).text()).toMatch(/code_verifier/);
  });

  it("rejects codes that did not come through the callback, and reused codes", async () => {
    const unknown = checkTokenRequest(
      form({ grant_type: "authorization_code", code: "nope", client_id: CLIENT, redirect_uri: REDIRECT, code_verifier: "v" }),
      FORM,
      "rundeck-mcp"
    );
    expect((unknown as Response).status).toBe(400);

    await codeFor(CLIENT, REDIRECT, "code-5");
    const body = form({ grant_type: "authorization_code", code: "code-5", client_id: CLIENT, redirect_uri: REDIRECT, code_verifier: "v" });
    expect(checkTokenRequest(body, FORM, "rundeck-mcp")).toBeInstanceOf(Buffer);
    expect((checkTokenRequest(body, FORM, "rundeck-mcp") as Response).status).toBe(400);
  });

  it("swaps the client id on refresh for CIMD clients only", () => {
    const refreshed = checkTokenRequest(
      form({ grant_type: "refresh_token", refresh_token: "r", client_id: CLIENT }),
      FORM,
      "rundeck-mcp"
    );
    expect(new URLSearchParams((refreshed as Buffer).toString()).get("client_id")).toBe("rundeck-mcp");
    const loopback = form({ grant_type: "refresh_token", refresh_token: "r", client_id: "rundeck-mcp" });
    expect(checkTokenRequest(loopback, FORM, "rundeck-mcp")).toBe(loopback);
  });
});
