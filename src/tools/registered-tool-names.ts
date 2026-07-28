/**
 * Single source of truth for the tool names always registered by the server
 * (i.e. excluding `rundeck_connect`, which is only pushed onto the ListTools
 * response when a multi-instance registry is configured — see index.ts).
 *
 * Kept side-effect-free and separate from index.ts so it can be imported
 * directly by unit tests without triggering index.ts's module-scope
 * configManager.initialize()/main()/stdio connection.
 */
export const REGISTERED_TOOL_NAMES: string[] = [
  "api_call",
  "api_list",
  "job_create",
  "job_validate",
  "runner_create",
  "acl_validate",
  "acl_manage",
  "docs_search",
];
