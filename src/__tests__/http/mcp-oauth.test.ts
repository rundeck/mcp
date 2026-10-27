import { oauthMetadataFromDiscovery } from "../../http/mcp-oauth.js";

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
