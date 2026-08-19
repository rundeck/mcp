/**
 * Human-in-the-loop confirmation for destructive tool calls, using the MCP
 * `elicitation/create` capability (Server.elicitInput) so the *client*
 * prompts the *human user* directly — independent of whatever the calling
 * model already believes counts as "the user approved this."
 *
 * Not every client declares the `elicitation` capability at initialize time.
 * When it isn't declared, callers fall back to the `confirm: true` parameter
 * gate (see index.ts) instead.
 *
 * Covers every action in this server that can't be walked back through the
 * Rundeck API: deleting a job/resource/ACL policy, overwriting an ACL
 * policy's contents, and regenerating a runner's credentials (which
 * immediately revokes the old ones).
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
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
    const result = await server.elicitInput({
      message: question,
      requestedSchema: {
        type: "object",
        properties: {
          confirmAction: {
            type: "boolean",
            title: "Yes, proceed",
            description: `Confirms: ${action.phrase}.`,
            default: false,
          },
        },
        required: ["confirmAction"],
      },
    });

    logger.info(
      `Elicitation response for "${action.phrase}": action=${result.action}, ` +
        `content=${JSON.stringify(result.content)}`
    );

    // `action === "accept"` means the human affirmatively answered the prompt — that's the
    // primary signal. Some clients don't echo the requestedSchema's field back in `content`
    // at all on accept (they treat a single-boolean form as a plain yes/no rather than
    // populating structured content), so requiring `content.confirmAction === true` in
    // addition to "accept" silently treated real approvals as declines. Only an *explicit*
    // `confirmAction: false` in the content (a client that does populate the form, with the
    // human unchecking it) should override an "accept" back to declined.
    if (result.action === "accept" && result.content?.confirmAction !== false) {
      return "confirmed";
    }
    return "declined";
  } catch (error) {
    logger.warn(
      `Elicitation request failed, falling back to the confirm parameter: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
    return "unsupported";
  }
}
