/**
 * Human-in-the-loop confirmation for destructive tool calls, using the MCP
 * `elicitation/create` capability so the *client* prompts the *human user*
 * directly — independent of whatever the calling model already believes
 * counts as "the user approved this."
 *
 * Written once via the Multi Round-Trip Requests (MRTR) pattern for both
 * protocol eras, per the SDK's own migration guidance
 * (https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.html):
 * a handler that returns an `InputRequiredResult` is served correctly on a
 * 2026-07-28-era connection natively, and on a 2025-era connection via the
 * SDK's built-in legacy shim — confirmed directly against the installed
 * SDK's runtime source (`Protocol.setRequestHandler` unconditionally wraps
 * every registered handler through `Server._wrapHandler`/
 * `_invokeInputRequiredCapableHandler`, which on a legacy-era request
 * dispatches to `LegacyInputRequiredShim.fulfill()`; that shim sends a real
 * `elicitation/create` request via the exact same `_sendElicitationLeg`
 * primitive `Server.elicitInput()` itself uses, then re-invokes this same
 * handler with `ctx.mcpReq.inputResponses` populated — this applies to a
 * raw `Server.setRequestHandler('tools/call', ...)` registration with no
 * `McpServer` needed). There is no more direct `server.elicitInput(...)`
 * call anywhere in this file: an earlier version of this function
 * hand-maintained a separate legacy branch that called it directly, which
 * worked but duplicated logic the SDK already provides.
 *
 * One behavioral difference from that earlier hand-rolled legacy branch:
 * a raw dispatch failure on a legacy connection (the elicitation request
 * itself erroring or timing out, as opposed to the client simply not
 * declaring the capability) now surfaces as the SDK's own generic
 * `isError` result from `LegacyInputRequiredShim`'s failure path, not this
 * codebase's friendlier `getConfirmationUnavailableGuidance` markdown —
 * that guidance text is still used for the (far more common) "client
 * never declared the elicitation capability at all" case, checked
 * explicitly below before ever returning an `InputRequiredResult`.
 *
 * The only bypass is the `SKIP_ELICITATION` environment variable, set by
 * whoever deploys/configures this server — never something the calling
 * agent can set itself.
 *
 * Covers every action in this server that can't be walked back through the
 * Rundeck API: deleting a job/resource/ACL policy, overwriting an ACL
 * policy's contents, and regenerating a runner's credentials (which
 * immediately revokes the old ones).
 */

import type { Server, ServerContext, InputRequiredResult } from "@modelcontextprotocol/server";
import { inputRequired, CLIENT_CAPABILITIES_META_KEY } from "@modelcontextprotocol/server";
import { logger } from "./logger.js";

export type ConfirmationOutcome = "confirmed" | "declined" | "unsupported";

export interface DestructiveAction {
  /**
   * Lowercase clause describing the action, e.g. "permanently delete ACL
   * policy 'admin' (system scope)". Embedded in guidance sentences and
   * (capitalized) in the elicitation prompt shown to the human.
   */
  phrase: string;
  /** One sentence explaining why this can't be walked back. */
  consequence: string;
}

/**
 * Either a final outcome, or an `InputRequiredResult` the caller must
 * return verbatim as the `tools/call` response — the SDK (natively on
 * 2026-07-28, via its legacy shim on 2025-era connections) fulfils it and
 * re-invokes the calling handler with the answer before this can resolve
 * to an outcome.
 */
export type ConfirmationResult =
  | { kind: "outcome"; outcome: ConfirmationOutcome }
  | { kind: "input_required"; result: InputRequiredResult };

const CONFIRM_KEY = "confirm";

function outcomeResult(outcome: ConfirmationOutcome): ConfirmationResult {
  return { kind: "outcome", outcome };
}

/**
 * Asks the connected client to prompt the human to confirm `action`.
 *
 * Returns `{ kind: "outcome" }` with:
 * - "confirmed": the human explicitly accepted (or `SKIP_ELICITATION` is set — see below).
 * - "declined": the human explicitly declined or cancelled the prompt.
 * - "unsupported": the client didn't declare the `elicitation` capability —
 *   no prompt was shown.
 *
 * With no answer recorded yet, returns `{ kind: "input_required" }`
 * instead — the caller MUST return `result` directly as the `tools/call`
 * response, unmodified.
 */
export async function requestDestructiveConfirmation(
  server: Server,
  ctx: ServerContext,
  action: DestructiveAction
): Promise<ConfirmationResult> {
  if (process.env.SKIP_ELICITATION === "1" || process.env.SKIP_ELICITATION === "true") {
    logger.warn(
      `SKIP_ELICITATION is set — bypassing live confirmation for "${action.phrase}" without asking the user.`
    );
    return outcomeResult("confirmed");
  }

  // Era-aware capability check, kept explicit here (rather than relying on
  // the SDK's own internal gate inside the modern seam / legacy shim) so a
  // client that never declared `elicitation` gets this codebase's
  // friendlier guidance markdown instead of the SDK's generic
  // missing-capability error shape. `ctx.mcpReq.envelope` is only
  // populated when the request actually carried the 2026-07-28 `_meta`
  // envelope, so its presence is the SDK's own per-request signal for
  // which era this request is being served over; `server.
  // getClientCapabilities()`'s doc comment claims it's backfilled per
  // request on the modern era, but that did not hold up against a real
  // client in testing — it returned `undefined` even though the request's
  // envelope carried a populated `clientCapabilities`. Read the capability
  // directly off the envelope instead, via the same
  // `CLIENT_CAPABILITIES_META_KEY` the SDK itself uses to store it there.
  const isModernEra = ctx.mcpReq.envelope !== undefined;
  const declaredCapabilities = isModernEra
    ? ((ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[CLIENT_CAPABILITIES_META_KEY] as
        | { elicitation?: unknown }
        | undefined)
    : server.getClientCapabilities();
  if (!declaredCapabilities?.elicitation) {
    return outcomeResult("unsupported");
  }

  // An answer recorded for this confirmation. Present identically whether
  // it arrived via a real 2026-07-28 client retry, or via the SDK's
  // in-process legacy shim re-invoking this same handler after it sent
  // the elicitation itself on a 2025-era connection — no era branching
  // needed to read it.
  const response = ctx.mcpReq.inputResponses?.[CONFIRM_KEY] as
    | { action?: string; content?: unknown }
    | undefined;

  if (response) {
    // The protocol-level `action` (accept/decline/cancel) alone is the
    // confirmation signal, never `content`: a single boolean form field
    // here was found, via live testing, to be unreliable across at least
    // one real client — its elicitation response came back as `action:
    // "accept"` (the human's actual "yes") but with `content: {
    // confirmAction: false }`, i.e. the schema's declared `default: false`
    // verbatim, not what the human picked. That's why the schema below
    // declares no fields at all.
    logger.info(`Elicitation response for "${action.phrase}": action=${response.action}`);
    return outcomeResult(response.action === "accept" ? "confirmed" : "declined");
  }

  if (ctx.mcpReq.droppedInputResponseKeys?.includes(CONFIRM_KEY)) {
    // The retry carried an entry for this confirmation, but the SDK
    // dropped it before this handler ever saw it (not a bare response
    // object — e.g. a wrapped `{method, result}` shape some peers emit).
    // Re-asking below is the only recoverable option, but log it so a
    // string of these isn't mistaken for the human simply not answering.
    logger.warn(
      `Retried confirmation for "${action.phrase}" carried a malformed inputResponses entry for ` +
        `"${CONFIRM_KEY}" (dropped by the SDK) — re-issuing the elicitation request.`
    );
  }

  const question = `${action.phrase.charAt(0).toUpperCase()}${action.phrase.slice(1)}? ${action.consequence}`;

  return {
    kind: "input_required",
    result: inputRequired({
      inputRequests: {
        [CONFIRM_KEY]: inputRequired.elicit({
          message: question,
          requestedSchema: {
            type: "object",
            properties: {},
          },
        }),
      },
    }),
  };
}
