import { jest } from "@jest/globals";
import type { Server, ServerContext } from "@modelcontextprotocol/server";
import { CLIENT_CAPABILITIES_META_KEY } from "@modelcontextprotocol/server";
import { requestDestructiveConfirmation, type DestructiveAction } from "../../utils/confirmation.js";

function fakeServer(overrides: { getClientCapabilities: Server["getClientCapabilities"] }): Server {
  return overrides as unknown as Server;
}

/**
 * A legacy (2025-era) request context: no `_meta` envelope at all.
 * Capability is read via `server.getClientCapabilities()`.
 */
function legacyCtx(options: {
  inputResponses?: Record<string, unknown>;
  droppedInputResponseKeys?: string[];
} = {}): ServerContext {
  return {
    mcpReq: {
      inputResponses: options.inputResponses,
      droppedInputResponseKeys: options.droppedInputResponseKeys,
    },
  } as unknown as ServerContext;
}

/**
 * A modern (2026-07-28-era) request context. `envelope` being present (even
 * empty) is the per-request signal this era is in play; the client's
 * declared capabilities are read directly off
 * `envelope[CLIENT_CAPABILITIES_META_KEY]` (not `server.getClientCapabilities()`
 * — that accessor was found, via a real-client integration test, to NOT
 * actually be backfilled per-request on a raw `Server` on this era, despite
 * its doc comment).
 */
function modernCtx(options: {
  inputResponses?: Record<string, unknown>;
  droppedInputResponseKeys?: string[];
  declaresElicitation?: boolean;
} = {}): ServerContext {
  const { inputResponses, droppedInputResponseKeys, declaresElicitation = true } = options;
  return {
    mcpReq: {
      envelope: {
        [CLIENT_CAPABILITIES_META_KEY]: declaresElicitation ? { elicitation: {} } : {},
      },
      inputResponses,
      droppedInputResponseKeys,
    },
  } as unknown as ServerContext;
}

const action: DestructiveAction = {
  phrase: "permanently delete job 'my-job'",
  consequence: "Rundeck's API has no undo for this.",
};

// requestDestructiveConfirmation is written once for both protocol eras (the
// MRTR pattern): it never calls the deprecated `server.elicitInput` itself
// anymore — on a 2025-era connection, the SDK's own legacy shim sends the
// real elicitation/create request and re-invokes this same handler with the
// answer, transparently. So the two describe blocks below exercise the same
// logic; they differ only in how the *capability check* reads (`ctx.mcpReq.
// envelope[...]` vs `server.getClientCapabilities()`), and both must never
// call `elicitInput` — that's asserted explicitly throughout.
describe.each([
  ["legacy (2025-era)", legacyCtx] as const,
  ["modern (2026-07-28-era)", modernCtx] as const,
])("requestDestructiveConfirmation — %s", (_label, makeCtx) => {
  const originalSkipElicitation = process.env.SKIP_ELICITATION;

  afterEach(() => {
    if (originalSkipElicitation === undefined) {
      delete process.env.SKIP_ELICITATION;
    } else {
      process.env.SKIP_ELICITATION = originalSkipElicitation;
    }
  });

  it("returns 'confirmed' without asking when SKIP_ELICITATION=1", async () => {
    process.env.SKIP_ELICITATION = "1";
    const server = fakeServer({ getClientCapabilities: () => ({ elicitation: {} }) });

    const result = await requestDestructiveConfirmation(server, makeCtx(), action);

    expect(result).toEqual({ kind: "outcome", outcome: "confirmed" });
  });

  it("does not bypass confirmation for other SKIP_ELICITATION values", async () => {
    process.env.SKIP_ELICITATION = "yes";
    const server = fakeServer({ getClientCapabilities: () => ({}) });

    const result = await requestDestructiveConfirmation(
      server,
      makeCtx({ declaresElicitation: false } as never),
      action
    );
    expect(result).toEqual({ kind: "outcome", outcome: "unsupported" });
  });

  it("returns 'unsupported' when the client doesn't declare the elicitation capability", async () => {
    const server = fakeServer({ getClientCapabilities: () => ({}) });

    const result = await requestDestructiveConfirmation(
      server,
      makeCtx({ declaresElicitation: false } as never),
      action
    );

    expect(result).toEqual({ kind: "outcome", outcome: "unsupported" });
  });

  it("returns an input_required result on first entry, with a capitalized message and no form fields", async () => {
    const server = fakeServer({ getClientCapabilities: () => ({ elicitation: {} }) });

    const result = await requestDestructiveConfirmation(server, makeCtx(), action);

    expect(result.kind).toBe("input_required");
    if (result.kind !== "input_required") throw new Error("unreachable");
    expect(result.result.resultType).toBe("input_required");
    const confirmRequest = result.result.inputRequests?.confirm as {
      params?: { message?: string; requestedSchema?: unknown };
    };
    expect(confirmRequest).toBeDefined();
    expect(confirmRequest.params?.message).toMatch(/^Permanently delete/);
    expect(confirmRequest.params?.requestedSchema).toEqual(
      expect.objectContaining({ type: "object", properties: {} })
    );
  });

  it("resolves to 'confirmed' on retry when inputResponses.confirm carries action: 'accept'", async () => {
    const server = fakeServer({ getClientCapabilities: () => ({ elicitation: {} }) });

    const result = await requestDestructiveConfirmation(
      server,
      makeCtx({ inputResponses: { confirm: { action: "accept" } } }),
      action
    );

    expect(result).toEqual({ kind: "outcome", outcome: "confirmed" });
  });

  it("resolves to 'declined' on retry when inputResponses.confirm carries action: 'decline'", async () => {
    const server = fakeServer({ getClientCapabilities: () => ({ elicitation: {} }) });

    const result = await requestDestructiveConfirmation(
      server,
      makeCtx({ inputResponses: { confirm: { action: "decline" } } }),
      action
    );

    expect(result).toEqual({ kind: "outcome", outcome: "declined" });
  });

  it("does not depend on content, mirroring accept even with a stale/mismatched value", async () => {
    // Observed live: a client returned action: "accept" (the human's real "yes") with
    // content: { confirmAction: false } — the requestedSchema's declared default, not what
    // the human picked. The decision must not depend on `content` at all; `action` alone
    // is the signal, and the schema declares no fields for exactly this reason.
    const server = fakeServer({ getClientCapabilities: () => ({ elicitation: {} }) });

    const result = await requestDestructiveConfirmation(
      server,
      makeCtx({ inputResponses: { confirm: { action: "accept", content: { confirmAction: false } } } }),
      action
    );

    expect(result).toEqual({ kind: "outcome", outcome: "confirmed" });
  });

  it("re-issues the elicitation when the retry's confirm entry was dropped as malformed", async () => {
    const server = fakeServer({ getClientCapabilities: () => ({ elicitation: {} }) });

    const result = await requestDestructiveConfirmation(
      server,
      makeCtx({ droppedInputResponseKeys: ["confirm"] }),
      action
    );

    expect(result.kind).toBe("input_required");
  });
});

describe("requestDestructiveConfirmation — never uses the deprecated server.elicitInput", () => {
  it("has no code path that calls server.elicitInput at all", async () => {
    const elicitInput = jest.fn();
    const server = {
      getClientCapabilities: () => ({ elicitation: {} }),
      elicitInput,
    } as unknown as Server;

    await requestDestructiveConfirmation(server, legacyCtx(), {
      phrase: "permanently delete job 'my-job'",
      consequence: "Rundeck's API has no undo for this.",
    });
    await requestDestructiveConfirmation(
      server,
      legacyCtx({ inputResponses: { confirm: { action: "accept" } } }),
      { phrase: "permanently delete job 'my-job'", consequence: "Rundeck's API has no undo for this." }
    );
    await requestDestructiveConfirmation(server, modernCtx(), {
      phrase: "permanently delete job 'my-job'",
      consequence: "Rundeck's API has no undo for this.",
    });

    expect(elicitInput).not.toHaveBeenCalled();
  });
});
