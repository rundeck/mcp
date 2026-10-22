/**
 * Decode JWT payload for telemetry / enduser.id (not for authorization decisions).
 */

export interface DecodedJwtPayload {
  sub?: string;
  preferred_username?: string;
  [claim: string]: unknown;
}

export function decodeJwtPayload(token: string): DecodedJwtPayload | undefined {
  const parts = token.split(".");
  if (parts.length < 2) {
    return undefined;
  }
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return parsed as DecodedJwtPayload;
  } catch {
    return undefined;
  }
}

export function bearerTokenFromAuthorizationHeader(
  header: string | undefined
): string | undefined {
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return undefined;
  }
  const token = match[1].trim();
  return token.length > 0 ? token : undefined;
}
