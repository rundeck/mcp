/**
 * Human-in-the-loop confirmation for destructive tool calls, using the MCP
 * `elicitation/create` capability (Server.elicitInput) so the *client*
 * prompts the *human user* directly — independent of whatever the calling
 * model already believes counts as "the user approved this."
 *
 * Not every client declares the `elicitation` capability at initialize time.
 * When it isn't declared, callers fall back to the `userHasProvidedConfirmation: true` parameter
 * gate (see index.ts) instead.
 *
 * Covers every action in this server that can't be walked back through the
 * Rundeck API: deleting a job/resource/ACL policy, overwriting an ACL
 * policy's contents, and regenerating a runner's credentials (which
 * immediately revokes the old ones).
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./logger.js";

export type ConfirmationOutcome = "confirmed" | "declined" | "unsupported";

/**
 * The MCP SDK's default request timeout (`DEFAULT_REQUEST_TIMEOUT_MSEC`) is 60 seconds — sized
 * for network round-trips, not for a human to read a destructive-action prompt and decide. Found
 * via live testing: a real elicitation prompt was shown, but the human took longer than 60s to
 * respond, so the SDK raised a timeout error before an answer ever came back. That got caught
 * below and (indistinguishably from a client that doesn't support elicitation at all) treated as
 * "unsupported," which is actively misleading — the client did support it, the human just hadn't
 * answered yet. Give it several minutes instead.
 */
const ELICITATION_TIMEOUT_MS = 5 * 60 * 1000;

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
 * Asks the connected client to prompt the human to confirm `action`.
 * Returns:
 * - "confirmed": the human explicitly accepted.
 * - "declined": the human explicitly declined or cancelled the prompt.
 * - "unsupported": the client didn't declare the `elicitation` capability
 *   (or the request otherwise failed) — no prompt was shown.
 */
export async function requestDestructiveConfirmation(
  server: Server,
  action: DestructiveAction
): Promise<ConfirmationOutcome> {
  if (!server.getClientCapabilities()?.elicitation) {
    return "unsupported";
  }

  try {
    const question = `${action.phrase.charAt(0).toUpperCase()}${action.phrase.slice(1)}? ${action.consequence}`;
    // Deliberately no form fields (empty `properties`): a single boolean field here was found,
    // via live testing, to be unreliable across at least one real client — its elicitation
    // response came back as `action: "accept"` (the human's actual "yes") but with
    // `content: { confirmAction: false }`, i.e. the schema's declared `default: false` verbatim,
    // not what the human picked. Rather than depend on any client correctly threading a form
    // field's value back through, the protocol-level `action` (accept/decline/cancel) alone is
    // the confirmation signal — that's what "accept" already means.
    const result = await server.elicitInput(
      {
        message: question,
        requestedSchema: {
          type: "object",
          properties: {},
        },
      },
      { timeout: ELICITATION_TIMEOUT_MS }
    );

    logger.info(
      `Elicitation response for "${action.phrase}": action=${result.action}, ` +
        `content=${JSON.stringify(result.content)}`
    );

    return result.action === "accept" ? "confirmed" : "declined";
  } catch (error) {
    const isTimeout = error instanceof McpError && error.code === ErrorCode.RequestTimeout;
    logger.warn(
      `Elicitation request ${isTimeout ? `timed out after ${ELICITATION_TIMEOUT_MS}ms without an answer` : "failed"}, ` +
        `falling back to the userHasProvidedConfirmation parameter: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
    return "unsupported";
  }
}
