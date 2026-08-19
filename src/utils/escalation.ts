/**
 * Shared instruction steering the calling agent to escalate to the user
 * instead of guessing, silently picking a default, or retrying blindly
 * whenever a tool, its fallback, or the referenced guidance still doesn't
 * get it to a working result.
 */

export const ASK_USER_LINE =
  "**If you can't complete this with the information available** (missing or ambiguous " +
  "parameters, an unclear target project/scope/instance, or a persistent error) — stop and " +
  "ask the user how to proceed rather than guessing, silently picking a default, or retrying " +
  "the same call repeatedly.";

/** Markdown section appended to guidance text and prompt content. */
export const ASK_USER_GUIDANCE = `\n\n## If you're still stuck\n${ASK_USER_LINE}`;

/** Trailer appended to tool-call error messages returned to the calling agent. */
export const ASK_USER_ERROR_TRAILER =
  "\n\nIf this keeps failing after checking the parameters above (and any fallback described " +
  "in the tool's guidance), ask the user how to proceed rather than retrying blindly or " +
  "fabricating a result.";
