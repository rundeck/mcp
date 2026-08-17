#!/usr/bin/env node

/**
 * Rundeck Documentation MCP Server
 * stdio entry point — used by Claude Desktop and stdio-based clients.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handleResource, listResources } from "./resources/index.js";
import {
  rundeckApiCall,
  rundeckListEndpoints,
  rundeckApiCallSchema,
  rundeckListEndpointsSchema,
} from "./tools/api.js";
import {
  rundeckGenerateJob,
  rundeckValidateJob,
  rundeckGenerateJobSchema,
  rundeckValidateJobSchema,
} from "./tools/jobs.js";
import { rundeckSearchDocs, rundeckSearchDocsSchema } from "./tools/search.js";
import { rundeckCreateRunner, rundeckCreateRunnerSchema } from "./tools/runners.js";
import { rundeckConnect, rundeckConnectSchema } from "./tools/connect.js";
import {
  rundeckValidateAcl,
  rundeckManageAcl,
  rundeckValidateAclSchema,
  rundeckManageAclSchema,
} from "./tools/acl.js";
import { REGISTERED_TOOL_NAMES } from "./tools/registered-tool-names.js";
import {
  API_CALL_DESCRIPTION,
  JOB_CREATE_DESCRIPTION,
  JOB_VALIDATE_DESCRIPTION,
  RUNNER_CREATE_DESCRIPTION,
  ACL_MANAGE_DESCRIPTION,
} from "./tools/tool-descriptions.js";
import { configManager } from "./config.js";
import { logger } from "./utils/logger.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  getJobCreationGuidance,
  getJobValidationGuidance,
  getApiCallGuidance,
  getRunnerGuidance,
  getAclValidateGuidance,
  getAclManageGuidance,
  getRundeckConnectGuidance,
  getDeleteConfirmationGuidance,
} from "./utils/guidance.js";
import { prompts, getPrompt } from "./prompts/index.js";
import { ASK_USER_ERROR_TRAILER, ASK_USER_LINE } from "./utils/escalation.js";

export { REGISTERED_TOOL_NAMES };

// Convert Zod schemas to JSON Schema (lazy conversion to avoid memory issues)
function convertSchema(schema: any): any {
  try {
    return zodToJsonSchema(schema);
  } catch (error) {
    logger.error("Error converting schema", error);
    return { type: "object", properties: {} };
  }
}

function missingRequiredScalar(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

function needsGuidance(params: unknown, requiredFields: string[]): boolean {
  if (!params || typeof params !== "object") return true;
  const args = params as Record<string, unknown>;
  return requiredFields.some((field) => missingRequiredScalar(args[field]));
}

function returnGuidance(guidanceContent: string) {
  return { content: [{ type: "text", text: guidanceContent }] };
}

// Initialize configuration
configManager.initialize();

const server = new Server(
  { name: "rundeck-docs", version: "1.0.0" },
  { capabilities: { resources: {}, tools: {}, prompts: {} } }
);

// ── Resources ──────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  logger.logRequest("resources/list", request.params);
  const resources = listResources();
  const result = {
    resources: resources.map((r) => ({
      uri: r.uri,
      name: r.description,
      mimeType: "text/markdown",
      description: r.description,
    })),
  };
  logger.logResponse("resources/list", result);
  return result;
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  logger.logRequest("resources/read", request.params);
  logger.logResourceAccess(uri);
  const content = handleResource(uri);
  const result = {
    contents: [{ uri, mimeType: "text/markdown", text: content }],
  };
  logger.logResponse("resources/read", result);
  return result;
});

// ── Tools ──────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  logger.logRequest("tools/list", request.params);
  const toolDefinitions: Record<string, { description: string; inputSchema: any }> = {
    api_call: {
      description: API_CALL_DESCRIPTION,
      inputSchema: convertSchema(rundeckApiCallSchema),
    },
    api_list: {
      description: `List available Rundeck API endpoints with descriptions and categories.

**When to use:**
- Discovering available API endpoints
- Finding endpoints for specific categories (jobs, projects, executions, etc.)
- Understanding API structure before making calls

**When NOT to use:**
- Making actual API calls (use api_call instead)
- Reading API documentation (use rundeck://api resource instead)

**Example:** List all job-related endpoints by calling with category: "jobs"

${ASK_USER_LINE}`,
      inputSchema: convertSchema(rundeckListEndpointsSchema),
    },
    job_create: {
      description: JOB_CREATE_DESCRIPTION,
      inputSchema: convertSchema(rundeckGenerateJobSchema),
    },
    job_validate: {
      description: JOB_VALIDATE_DESCRIPTION,
      inputSchema: convertSchema(rundeckValidateJobSchema),
    },
    runner_create: {
      description: RUNNER_CREATE_DESCRIPTION,
      inputSchema: convertSchema(rundeckCreateRunnerSchema),
    },
    acl_validate: {
      description: `Validate a Rundeck ACL Policy YAML document offline against the aclpolicy v1.0 format.

**When to use:**
- Checking ACL policy structure (context, for, by/notBy, allow/deny) before creating or updating it
- Debugging why a policy might be silently rejecting access (missing match clause, missing by/notBy, etc.)

**When NOT to use:**
- Actually creating/updating/deleting a policy on the server (use acl_manage instead)
- Making generic API calls (use api_call instead)

**Reference docs (read these directly — do not guess the URI or list all resources):**
- \`rundeck://docs/manual/document-format-reference/aclpolicy-v10\` — full YAML format spec (context, for, by/notBy, allow/deny)
- Worked examples, one per access pattern: \`rundeck://docs/learning/howto/acls/group-readonly\`, \`rundeck://docs/learning/howto/acls/group-project-exec\`, \`rundeck://docs/learning/howto/acls/group-project-full\`, \`rundeck://docs/learning/howto/acls/group-manage-runner\`, \`rundeck://docs/learning/howto/acls/group-jobname\`, \`rundeck://docs/learning/howto/acls/group-jobgroup\`, \`rundeck://docs/learning/howto/acls/group-node-filtered\`, \`rundeck://docs/learning/howto/acls/group-multiproject\`, \`rundeck://docs/learning/howto/acls/group-apikey\`

**Guidance Mode:** Call without required params (acl_definition) to get guidance.
**Note:** This is a local structural check, not a substitute for Rundeck's own server-side validation.

${ASK_USER_LINE}`,
      inputSchema: convertSchema(rundeckValidateAclSchema),
    },
    acl_manage: {
      description: ACL_MANAGE_DESCRIPTION,
      inputSchema: convertSchema(rundeckManageAclSchema),
    },
    docs_search: {
      description: `Search local Rundeck documentation (markdown under RUNDECK_DOCS_PATH) by keywords and phrases.

**When to use:**
- Finding where a topic, term, or feature is documented before opening a resource
- Exploring the docs when you do not know the exact \`rundeck://\` URI
- Getting ranked excerpts and file paths to narrow which resource to read next

**When NOT to use:**
- Reading a full document you already identified (use resources/read with the \`rundeck://...\` URI)
- Making API calls to a Rundeck server (use api_call)
- Generating jobs (use job_create)

**Follow-up:** Prefer \`resources/read\` on the best match for complete, authoritative content.

${ASK_USER_LINE}`,
      inputSchema: convertSchema(rundeckSearchDocsSchema),
    },
  };

  const tools = REGISTERED_TOOL_NAMES.map((name) => ({ name, ...toolDefinitions[name] }));

  // Only exposed when RUNDECK_INSTANCES defines a multi-instance registry.
  // Without it, RUNDECK_URL/RUNDECK_TOKEN are the only connection and there's
  // nothing to switch between, so the tool would just be confusing clutter.
  if (configManager.hasInstanceRegistry()) {
    tools.push({
      name: "rundeck_connect",
      description: `Switch the active Rundeck instance by name, when multiple instances are registered via RUNDECK_INSTANCES.

**When to use:**
- The user asks to use a different registered Rundeck instance (e.g. "switch to staging")

**When NOT to use:**
- Only one Rundeck instance is configured (this tool won't be available in that case)
- Making API calls (use api_call instead — it uses whichever instance is currently active)

**Input:** Only a registered instance **name** — never a URL or token.
**Guidance:** Omit \`instance\` to see the list of registered instance names.

${ASK_USER_LINE}`,
      inputSchema: convertSchema(rundeckConnectSchema),
    });
  }

  logger.info(`Returning ${tools.length} tools`);
  const result = { tools };
  logger.logResponse("tools/list", result);
  return result;
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.logRequest("tools/call", request.params);
  logger.logToolCall(name, args);

  try {
    switch (name) {
      case "api_call": {
        if (needsGuidance(args, ["endpoint"])) {
          logger.info("api_call called without required params - returning guidance");
          return returnGuidance(getApiCallGuidance());
        }
        const parsed = rundeckApiCallSchema.parse(args ?? {});
        if (parsed.method === "DELETE" && !parsed.confirm) {
          logger.info("api_call DELETE requested without confirm - requesting confirmation");
          return returnGuidance(
            getDeleteConfirmationGuidance("api_call", `the resource at \`${parsed.endpoint}\``)
          );
        }
        const apiResult = await rundeckApiCall(parsed);
        return { content: [{ type: "text", text: JSON.stringify(apiResult, null, 2) }] };
      }

      case "api_list": {
        const parsed = rundeckListEndpointsSchema.parse(args ?? {});
        const endpoints = rundeckListEndpoints(parsed);
        return { content: [{ type: "text", text: JSON.stringify(endpoints, null, 2) }] };
      }

      case "job_create": {
        if (needsGuidance(args, ["name", "project", "workflow_steps"])) {
          logger.info("job_create called without required params - returning guidance");
          return returnGuidance(getJobCreationGuidance());
        }
        const parsed = rundeckGenerateJobSchema.parse(args ?? {});
        const jobDef = rundeckGenerateJob(parsed);
        return { content: [{ type: "text", text: jobDef }] };
      }

      case "job_validate": {
        if (needsGuidance(args, ["job_definition", "format"])) {
          logger.info("job_validate called without required params - returning guidance");
          return returnGuidance(getJobValidationGuidance());
        }
        const parsed = rundeckValidateJobSchema.parse(args ?? {});
        const validation = rundeckValidateJob(parsed);
        return { content: [{ type: "text", text: JSON.stringify(validation, null, 2) }] };
      }

      case "runner_create": {
        if (needsGuidance(args, ["name", "scope"])) {
          logger.info("runner_create called without required params - returning guidance");
          return returnGuidance(getRunnerGuidance());
        }
        const runnerParams = rundeckCreateRunnerSchema.parse(args);
        const runnerResult = await rundeckCreateRunner(runnerParams);
        return { content: [{ type: "text", text: JSON.stringify(runnerResult, null, 2) }] };
      }

      case "acl_validate": {
        if (needsGuidance(args, ["acl_definition"])) {
          logger.info("acl_validate called without required params - returning guidance");
          return returnGuidance(getAclValidateGuidance());
        }
        const parsed = rundeckValidateAclSchema.parse(args ?? {});
        const aclValidation = rundeckValidateAcl(parsed);
        return { content: [{ type: "text", text: JSON.stringify(aclValidation, null, 2) }] };
      }

      case "acl_manage":
        if (needsGuidance(args, ["action", "scope"])) {
          logger.info("acl_manage called without required params - returning guidance");
          return returnGuidance(getAclManageGuidance());
        }
        const aclParams = rundeckManageAclSchema.parse(args);
        if (aclParams.action === "delete" && !aclParams.confirm) {
          logger.info("acl_manage delete requested without confirm - requesting confirmation");
          const scopeDetail =
            aclParams.scope === "project" ? `project '${aclParams.project}'` : "system scope";
          return returnGuidance(
            getDeleteConfirmationGuidance(
              "acl_manage",
              `ACL policy '${aclParams.name}' (${scopeDetail})`
            )
          );
        }
        const aclResult = await rundeckManageAcl(aclParams);
        return { content: [{ type: "text", text: JSON.stringify(aclResult, null, 2) }] };

      case "docs_search": {
        const parsed = rundeckSearchDocsSchema.parse(args ?? {});
        const searchHits = rundeckSearchDocs(parsed);
        return { content: [{ type: "text", text: JSON.stringify(searchHits, null, 2) }] };
      }

      case "rundeck_connect": {
        if (!configManager.hasInstanceRegistry()) {
          throw new Error(
            "rundeck_connect is unavailable: no RUNDECK_INSTANCES registry is configured."
          );
        }
        if (needsGuidance(args, ["instance"])) {
          logger.info("rundeck_connect called without required params - returning guidance");
          return returnGuidance(getRundeckConnectGuidance(configManager.listInstanceNames()));
        }
        const parsed = rundeckConnectSchema.parse(args ?? {});
        const connectResult = await rundeckConnect(parsed);
        return { content: [{ type: "text", text: JSON.stringify(connectResult, null, 2) }] };
      }

      default: {
        logger.warn(`Unknown tool requested: ${name}`);
        const available = [...REGISTERED_TOOL_NAMES];
        if (configManager.hasInstanceRegistry()) {
          available.push("rundeck_connect");
        }
        throw new Error(`Unknown tool: ${name}. Available tools: ${available.join(", ")}.`);
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof z.ZodError
        ? error.issues.map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`).join("; ")
        : error instanceof Error
          ? error.message
          : String(error);
    logger.error(`Tool error for ${name}`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool '${name}': ${errorMessage}${ASK_USER_ERROR_TRAILER}`,
        },
      ],
      isError: true,
    };
  }
});

// ── Prompts ────────────────────────────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
  logger.logRequest("prompts/list", request.params);
  const promptList = prompts.map((prompt) => ({
    name: prompt.name,
    description: prompt.description,
    arguments: (prompt.arguments ?? []).map((arg) => ({
      name: arg.name,
      description: arg.description,
      required: arg.required,
    })),
  }));
  logger.info(`Returning ${promptList.length} prompts`);
  const result = { prompts: promptList };
  logger.logResponse("prompts/list", result);
  return result;
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.logRequest("prompts/get", request.params);

  try {
    const prompt = getPrompt(name);
    if (!prompt) {
      const availablePrompts = prompts.map((p) => p.name).join(", ");
      const errorMessage = `Prompt "${name}" not found. Available prompts: ${availablePrompts}`;
      logger.warn(errorMessage);
      return { content: [{ type: "text", text: errorMessage }], isError: true };
    }

    if (prompt.argumentSchema && args) {
      try {
        prompt.argumentSchema.parse(args);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          const errorMessages = validationError.errors
            .map((err) => `${err.path.join(".")}: ${err.message}`)
            .join("; ");
          const errorMessage = `Invalid arguments for prompt "${name}": ${errorMessages}`;
          logger.warn(errorMessage);
          return { content: [{ type: "text", text: errorMessage }], isError: true };
        }
      }
    }

    if (prompt.arguments) {
      const missingRequired = prompt.arguments
        .filter((arg) => arg.required && (!args || !(arg.name in args)))
        .map((arg) => arg.name);
      if (missingRequired.length > 0) {
        const errorMessage = `Missing required arguments for prompt "${name}": ${missingRequired.join(", ")}`;
        logger.warn(errorMessage);
        return { content: [{ type: "text", text: errorMessage }], isError: true };
      }
    }

    const content = prompt.getContent(args || {});
    logger.logResponse("prompts/get", { name, hasContent: !!content });
    return { messages: [{ role: "user", content: { type: "text", text: content } }] };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting prompt "${name}":`, errorMessage);
    return {
      content: [{ type: "text", text: `Error retrieving prompt "${name}": ${errorMessage}` }],
      isError: true,
    };
  }
});

// ── Error handler ──────────────────────────────────────────────────────────

server.onerror = (error) => {
  logger.error("MCP server error", error);
};

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Rundeck Documentation MCP server running on stdio");
}

main().catch((error) => {
  logger.error("Fatal error starting server", error);
  process.exit(1);
});
