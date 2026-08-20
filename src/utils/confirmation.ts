/**
 * Human-in-the-loop confirmation for destructive tool calls, using the MCP
 * `elicitation/create` capability (Server.elicitInput) so the *client*
 * prompts the *human user* directly — independent of whatever the calling
 * model already believes counts as "the user approved this."
 *
 * There is no per-call fallback path: if the connected client doesn't
 * declare the `elicitation` capability, or the elicitation request itself
 * fails, the action is simply not performed — see
 * `getConfirmationUnavailableGuidance` in guidance.ts for what the calling
 * agent is told in that case. The only bypass is the `SKIP_ELICITATION`
 * environment variable, set by whoever deploys/configures this server —
 * never something the calling agent can set itself.
 *
 * Covers every action in this server that can't be walked back through the
 * Rundeck API: deleting a job/resource/ACL policy, overwriting an ACL
 * policy's contents, and regenerating a runner's credentials (which
 * immediately revokes the old ones).
 */

import type { Server } from "@modelcontextprotocol/server";
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
 * Asks the connected client to prompt the human to confirm `action`.
 * Returns:
 * - "confirmed": the human explicitly accepted (or `SKIP_ELICITATION` is set — see below).
 * - "declined": the human explicitly declined or cancelled the prompt.
 * - "unsupported": the client didn't declare the `elicitation` capability
 *   (or the request otherwise failed, including timing out) — no prompt
 *   was shown, or an answer never came back.
 */
export async function requestDestructiveConfirmation(
  server: Server,
  action: DestructiveAction
): Promise<ConfirmationOutcome> {
  if (process.env.SKIP_ELICITATION === "1" || process.env.SKIP_ELICITATION === "true") {
    logger.warn(
      `SKIP_ELICITATION is set — bypassing live confirmation for "${action.phrase}" without asking the user.`
    );
    return "confirmed";
  }

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
    const result = await server.elicitInput({
      message: question,
      requestedSchema: {
        type: "object",
        properties: {},
      },
    });

    logger.info(
      `Elicitation response for "${action.phrase}": action=${result.action}, ` +
        `content=${JSON.stringify(result.content)}`
    );

    return result.action === "accept" ? "confirmed" : "declined";
  } catch (error) {
    logger.warn(
      `Elicitation request failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return "unsupported";
  }
}
