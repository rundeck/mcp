import {
  bearerTokenFromAuthorizationHeader,
  decodeJwtPayload,
} from "../../auth/jwt-payload.js";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("jwt-payload", () => {
  it("extracts Bearer token from Authorization header", () => {
    expect(bearerTokenFromAuthorizationHeader("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerTokenFromAuthorizationHeader("bearer tok")).toBe("tok");
    expect(bearerTokenFromAuthorizationHeader(undefined)).toBeUndefined();
  });

  it("decodes sub from JWT payload", () => {
    const token = fakeJwt({ sub: "user-123", preferred_username: "alice" });
    expect(decodeJwtPayload(token)?.sub).toBe("user-123");
  });
});
