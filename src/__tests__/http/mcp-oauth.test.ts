import {
  applyMcpTokenEndpointProxy,
  isJwtFormat,
  oauthMetadataFromDiscovery,
  resolveMcpAccessToken,
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
  it("points token_endpoint at the MCP origin", () => {
    const meta = oauthMetadataFromDiscovery("https://accounts.google.com", {
      issuer: "https://accounts.google.com",
      authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      token_endpoint: "https://oauth2.googleapis.com/token",
    });
    const proxied = applyMcpTokenEndpointProxy(meta, new URL("http://127.0.0.1:3000/mcp"));
    expect(proxied.token_endpoint).toBe("http://127.0.0.1:3000/oauth/token");
    expect(proxied.authorization_endpoint).toBe(meta.authorization_endpoint);
  });
});

describe("isJwtFormat", () => {
  it("detects three-part tokens", () => {
    expect(isJwtFormat("a.b.c")).toBe(true);
    expect(isJwtFormat("ya29.foo")).toBe(false);
  });
});
