import {
  applyMcpTokenEndpointProxy,
  handleOAuthAuthorize,
  handleOAuthCallback,
  isAllowedClientRedirectUri,
  isJwtFormat,
  oauthMetadataFromDiscovery,
  resolveMcpAccessToken,
  rewriteTokenRequestRedirectUri,
  type McpOAuthRuntime,
} from "../../http/mcp-oauth.js";

describe("oauthMetadataFromDiscovery", () => {
  it("maps OIDC discovery fields to OAuth metadata", () => {
    const meta = oauthMetadataFromDiscovery("https://auth.example.com", {
      issuer: "https://auth.example.com/",
      authorization_endpoint: "https://auth.example.com/authorize",
      token_endpoint: "https://auth.example.com/oauth/token",
      jwks_uri: "https://auth.example.com/.well-known/jwks.json",
      registration_endpoint: "https://auth.example.com/oauth/register",
    });
    expect(meta.issuer).toBe("https://auth.example.com/");
    expect(meta.authorization_endpoint).toBe("https://auth.example.com/authorize");
    expect(meta.token_endpoint).toBe("https://auth.example.com/oauth/token");
    expect(meta.jwks_uri).toBe("https://auth.example.com/.well-known/jwks.json");
    expect(meta.registration_endpoint).toBe("https://auth.example.com/oauth/register");
  });

  it("throws when required endpoints are missing", () => {
    expect(() =>
      oauthMetadataFromDiscovery("https://auth.example.com", { issuer: "https://auth.example.com" })
    ).toThrow(/authorization_endpoint/);
  });
});

describe("resolveMcpAccessToken", () => {
  const googleLike = {
    access_token: "ya29.opaque",
    id_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.sig",
  };

  it("replaces opaque access_token with id_token in auto mode", () => {
    resolveMcpAccessToken(googleLike);
    expect(googleLike.access_token).toBe(googleLike.id_token);
  });

  it("keeps upstream JWT access_token in auto mode", () => {
    const auth0Like = {
      access_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.sig",
      id_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ5In0.sig",
    };
    resolveMcpAccessToken(auth0Like);
    expect(auth0Like.access_token).toBe(
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.sig"
    );
  });
});

describe("applyMcpTokenEndpointProxy", () => {
  it("points issuer and endpoints at the MCP origin", () => {
    const meta = oauthMetadataFromDiscovery("https://accounts.google.com", {
      issuer: "https://accounts.google.com",
      authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      token_endpoint: "https://oauth2.googleapis.com/token",
    });
    const proxied = applyMcpTokenEndpointProxy(meta, new URL("http://127.0.0.1:3000/mcp"));
    expect(proxied.token_endpoint).toBe("http://127.0.0.1:3000/oauth/token");
    expect(proxied.authorization_endpoint).toBe("http://127.0.0.1:3000/oauth/authorize");
    // PRM authorization_servers and RFC 9207 `iss` checks both key off the issuer.
    expect(proxied.issuer).toBe("http://127.0.0.1:3000");
  });

  it("leaves IdP metadata untouched when MCP_OAUTH_PROXY_TOKEN=0", () => {
    const prev = process.env.MCP_OAUTH_PROXY_TOKEN;
    process.env.MCP_OAUTH_PROXY_TOKEN = "0";
    const meta = oauthMetadataFromDiscovery("https://accounts.google.com", {
      issuer: "https://accounts.google.com",
      authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      token_endpoint: "https://oauth2.googleapis.com/token",
    });
    expect(applyMcpTokenEndpointProxy(meta, new URL("http://127.0.0.1:3000/mcp"))).toEqual(meta);
    process.env.MCP_OAUTH_PROXY_TOKEN = prev;
  });
});

describe("isJwtFormat", () => {
  it("detects three-part tokens", () => {
    expect(isJwtFormat("a.b.c")).toBe(true);
    expect(isJwtFormat("ya29.foo")).toBe(false);
  });
});

describe("rundeckJwtPassthroughVerifier", () => {
  it("rejects opaque bearer when RUNDECK_AUTH_MODE=jwt_bearer", async () => {
    const prevMode = process.env.RUNDECK_AUTH_MODE;
    process.env.RUNDECK_AUTH_MODE = "jwt_bearer";
    const { rundeckJwtPassthroughVerifier } = await import("../../http/mcp-oauth.js");
    await expect(rundeckJwtPassthroughVerifier.verifyAccessToken("ya29.opaque")).rejects.toThrow(
      /JWT/
    );
    process.env.RUNDECK_AUTH_MODE = prevMode;
  });
});

function proxyRuntime(): McpOAuthRuntime {
  return {
    authMetadata: {
      oauthMetadata: {
        issuer: "http://127.0.0.1:3000",
        authorization_endpoint: "http://127.0.0.1:3000/oauth/authorize",
        token_endpoint: "http://127.0.0.1:3000/oauth/token",
        response_types_supported: ["code"],
      },
      resourceServerUrl: new URL("http://127.0.0.1:3000/mcp"),
    },
    resourceMetadataUrl: "http://127.0.0.1:3000/.well-known/oauth-protected-resource/mcp",
    verifier: { verifyAccessToken: async () => ({ token: "t", clientId: "c", scopes: [] }) },
    upstreamTokenEndpoint: "https://oauth2.googleapis.com/token",
    upstreamAuthorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    callbackUrl: "http://127.0.0.1:3000/oauth/callback",
  };
}

describe("OAuth authorize/callback proxy", () => {
  it("round-trips the client's redirect_uri and state with the MCP as iss", () => {
    const runtime = proxyRuntime();
    const authorize = handleOAuthAuthorize(
      new URL(
        "http://127.0.0.1:3000/oauth/authorize?response_type=code&client_id=cid" +
          "&redirect_uri=http%3A%2F%2Flocalhost%3A8765%2Fcallback&state=client-state" +
          "&code_challenge=abc&code_challenge_method=S256&scope=openid"
      ),
      runtime
    );
    expect(authorize.status).toBe(302);
    const upstream = new URL(authorize.headers.get("Location")!);
    expect(upstream.origin + upstream.pathname).toBe(runtime.upstreamAuthorizationEndpoint);
    expect(upstream.searchParams.get("redirect_uri")).toBe(runtime.callbackUrl);
    expect(upstream.searchParams.get("code_challenge")).toBe("abc");
    expect(upstream.searchParams.get("client_id")).toBe("cid");
    const key = upstream.searchParams.get("state")!;
    expect(key).not.toBe("client-state");

    const callback = handleOAuthCallback(
      new URL(
        `http://127.0.0.1:3000/oauth/callback?code=the-code&state=${key}` +
          "&iss=https%3A%2F%2Faccounts.google.com"
      ),
      runtime
    );
    expect(callback.status).toBe(302);
    const back = new URL(callback.headers.get("Location")!);
    expect(back.origin + back.pathname).toBe("http://localhost:8765/callback");
    expect(back.searchParams.get("code")).toBe("the-code");
    expect(back.searchParams.get("state")).toBe("client-state");
    expect(back.searchParams.get("iss")).toBe("http://127.0.0.1:3000");

    // State is single-use.
    expect(
      handleOAuthCallback(
        new URL(`http://127.0.0.1:3000/oauth/callback?code=x&state=${key}`),
        runtime
      ).status
    ).toBe(400);
  });

  it("forwards IdP errors to the client", () => {
    const runtime = proxyRuntime();
    const authorize = handleOAuthAuthorize(
      new URL("http://127.0.0.1:3000/oauth/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A9%2Fcb"),
      runtime
    );
    const key = new URL(authorize.headers.get("Location")!).searchParams.get("state")!;
    const back = new URL(
      handleOAuthCallback(
        new URL(`http://127.0.0.1:3000/oauth/callback?error=access_denied&state=${key}`),
        runtime
      ).headers.get("Location")!
    );
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.has("state")).toBe(false);
  });

  it("rejects non-loopback redirect URIs unless allow-listed", () => {
    expect(isAllowedClientRedirectUri("http://localhost:8765/callback")).toBe(true);
    expect(isAllowedClientRedirectUri("https://evil.example.com/cb")).toBe(false);
    const prev = process.env.MCP_OAUTH_ALLOWED_REDIRECT_URIS;
    process.env.MCP_OAUTH_ALLOWED_REDIRECT_URIS = "cursor://anysphere.cursor-mcp/oauth/callback";
    expect(isAllowedClientRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
    process.env.MCP_OAUTH_ALLOWED_REDIRECT_URIS = prev;

    const res = handleOAuthAuthorize(
      new URL("http://127.0.0.1:3000/oauth/authorize?redirect_uri=https%3A%2F%2Fevil.example.com%2Fcb"),
      proxyRuntime()
    );
    expect(res.status).toBe(400);
  });

  it("rewrites redirect_uri only on authorization_code form requests", () => {
    const form = "application/x-www-form-urlencoded";
    const cb = "http://127.0.0.1:3000/oauth/callback";
    const code = Buffer.from(
      "grant_type=authorization_code&code=c&redirect_uri=http%3A%2F%2Flocalhost%3A8765%2Fcallback"
    );
    expect(
      new URLSearchParams(rewriteTokenRequestRedirectUri(code, form, cb).toString()).get(
        "redirect_uri"
      )
    ).toBe(cb);
    const refresh = Buffer.from("grant_type=refresh_token&refresh_token=r");
    expect(rewriteTokenRequestRedirectUri(refresh, form, cb)).toBe(refresh);
    expect(rewriteTokenRequestRedirectUri(code, form, undefined)).toBe(code);
  });
});
