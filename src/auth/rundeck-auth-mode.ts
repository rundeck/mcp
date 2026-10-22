export type RundeckAuthMode = "pat" | "jwt_bearer";

export function getRundeckAuthMode(): RundeckAuthMode {
  const raw = process.env.RUNDECK_AUTH_MODE?.trim().toLowerCase();
  if (raw === "jwt_bearer" || raw === "jwt") {
    return "jwt_bearer";
  }
  return "pat";
}

export function getMcpTransport(): "stdio" | "http" | "both" {
  const raw = process.env.MCP_TRANSPORT?.trim().toLowerCase();
  if (raw === "http" || raw === "both") {
    return raw;
  }
  return "stdio";
}

/** Fail fast on unsupported combinations (see mcp-http-oauth-jwt spec). */
export function validateTransportAndAuthMode(): void {
  const mode = getRundeckAuthMode();
  const transport = getMcpTransport();
  if (mode === "jwt_bearer" && transport === "stdio") {
    throw new Error(
      "RUNDECK_AUTH_MODE=jwt_bearer requires MCP_TRANSPORT=http (or both). " +
        "JWT bearer auth is per HTTP request; use RUNDECK_AUTH_MODE=pat for stdio."
    );
  }
}
