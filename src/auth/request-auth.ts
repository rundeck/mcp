import type { Server } from "@modelcontextprotocol/server";
import { AsyncLocalStorage } from "node:async_hooks";
import { decodeJwtPayload } from "./jwt-payload.js";

export interface RequestAuthState {
  bearerToken?: string;
  enduserId?: string;
}

const requestAuthByServer = new WeakMap<Server, RequestAuthState>();
const activeServerStore = new AsyncLocalStorage<{ server: Server }>();

export function bindRequestAuthToServer(server: Server, bearerToken: string | undefined): void {
  if (!bearerToken) {
    return;
  }
  const payload = decodeJwtPayload(bearerToken);
  requestAuthByServer.set(server, {
    bearerToken,
    enduserId: typeof payload?.sub === "string" ? payload.sub : undefined,
  });
}

export function getRequestAuthForActiveCall(): RequestAuthState | undefined {
  const active = activeServerStore.getStore();
  if (!active) {
    return undefined;
  }
  return requestAuthByServer.get(active.server);
}

/** Scope tool handlers so Rundeck API calls can resolve the per-request Bearer token. */
export function withActiveServerAuth<T>(
  server: Server,
  fn: () => Promise<T> | T
): Promise<T> | T {
  return activeServerStore.run({ server }, fn);
}

export function clearRequestAuthForServer(server: Server): void {
  requestAuthByServer.delete(server);
}
