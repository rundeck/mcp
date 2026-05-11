#!/usr/bin/env node

/**
 * Rundeck Documentation MCP Server
 * Main entry point
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
import {
  rundeckSearchDocs,
  rundeckSearchDocsSchema,
} from "./tools/search.js";
import {
  getApiCallGuidance,
  getJobCreationGuidance,
  getJobValidationGuidance,
} from "./utils/guidance.js";
import { configManager } from "./config.js";
import { logger } from "./utils/logger.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { JsonSchema7Type } from "zod-to-json-schema";
import { prompts, getPrompt } from "./prompts/index.js";

/*
 * Phase 1 (internal release, PRD): do not register `plugin_create` as an MCP tool —
 * plugin scaffolding is explicitly out of scope for P1. Implementation remains in
 * `src/tools/plugins.ts` for Phase 2+.
 *
 * `rundeckGetExample` in `search.ts` is likewise not exposed as `docs_example`
 * for P1; use `docs_search` + `resources/read` instead.
 */

// Initialize configuration
configManager.initialize();

// Create MCP server
const server = new Server(
  {
    name: "rundeck-docs",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

// List resources
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

// Read resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  logger.logRequest("resources/read", request.params);
  logger.logResourceAccess(uri);
  const content = handleResource(uri);
  const result = {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text: content,
      },
    ],
  };
  logger.logResponse("resources/read", result);
  return result;
});

// Convert Zod schemas to JSON Schema (lazy conversion to avoid memory issues)
// Using 'any' to avoid deep type instantiation issues with complex schemas
function convertSchema(schema: any): any {
  try {
    return zodToJsonSchema(schema);
  } catch (error) {
    logger.error("Error converting schema", error);
    // Fallback to a basic object schema
    return {
      type: "object",
      properties: {},
    };
  }
}

const apiCallInputSchema = convertSchema(rundeckApiCallSchema);
const apiListInputSchema = convertSchema(rundeckListEndpointsSchema);
const jobCreateInputSchema = convertSchema(rundeckGenerateJobSchema);
const jobValidateInputSchema = convertSchema(rundeckValidateJobSchema);
const docsSearchInputSchema = convertSchema(rundeckSearchDocsSchema);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  logger.logRequest("tools/list", request.params);
  const tools = [
    {
      name: "api_call",
      description: `Execute a Rundeck API call to interact with a Rundeck instance.
      
**When to use:**
- Making API requests to Rundeck (GET, POST, PUT, DELETE, PATCH)
- Querying projects, jobs, executions, nodes, or system information
- Triggering job executions via API
- Managing Rundeck resources programmatically

**When NOT to use:**
- Reading documentation (use resources instead: rundeck://docs/*)
- Creating job definitions (use job_create instead)
- Validating job definitions (use job_validate instead)

**Authentication:** Set RUNDECK_URL and RUNDECK_TOKEN environment variables before calling.
Guided flows: MCP prompts \`setup-authentication\` and \`call-api\`.
**Guidance:** Omit \`endpoint\` (or pass it empty) to receive step-by-step API usage instructions in the tool result.`,
      inputSchema: apiCallInputSchema,
    },
    {
      name: "api_list",
      description: `List available Rundeck API endpoints with descriptions and categories.

**When to use:**
- Discovering available API endpoints
- Finding endpoints for specific categories (jobs, projects, executions, etc.)
- Understanding API structure before making calls

**When NOT to use:**
- Making actual API calls (use api_call instead)
- Reading API documentation (use rundeck://api resource instead)

**Example:** List all job-related endpoints by calling with category: "jobs"`,
      inputSchema: apiListInputSchema,
    },
    {
      name: "job_create",
      description: `Generate a Rundeck job definition in YAML or JSON format.

**When to use:**
- Creating new job definitions from structured parameters
- Generating job YAML/JSON for import into Rundeck
- Building jobs programmatically

**When NOT to use:**
- Validating existing job definitions (use job_validate instead)
- Making API calls (use api_call instead)
- Reading job documentation (use rundeck://docs/manual/jobs resource instead)

For a guided authoring flow, open the MCP prompt \`create-job\`.
**Guidance:** Omit any of \`name\`, \`project\`, or \`workflow_steps\` to receive job-authoring instructions in the tool result.
**Resources:** See rundeck://docs/manual/jobs for comprehensive job documentation.`,
      inputSchema: jobCreateInputSchema,
    },
    {
      name: "job_validate",
      description: `Validate a Rundeck job definition against Rundeck schemas.

**When to use:**
- Validating job YAML/JSON before importing
- Checking job syntax and structure
- Debugging job definition errors

**When NOT to use:**
- Creating job definitions (use job_create instead)
- Making API calls (use api_call instead)
- Reading job schema (use rundeck://jobs/schema resource instead)

**Output:** Returns validation result with errors and warnings.
**Guidance:** Omit \`job_definition\` or \`format\` (or pass empty \`job_definition\`) to receive validation instructions in the tool result.`,
      inputSchema: jobValidateInputSchema,
    },
    {
      name: "docs_search",
      description: `Search local Rundeck documentation (markdown under RUNDECK_DOCS_PATH) by keywords and phrases.

**When to use:**
- Finding where a topic, term, or feature is documented before opening a resource
- Exploring the docs when you do not know the exact \`rundeck://\` URI
- Getting ranked excerpts and file paths to narrow which resource to read next

**When NOT to use:**
- Reading a full document you already identified (use resources/read with the \`rundeck://...\` URI)
- Making API calls to a Rundeck server (use api_call)
- Generating jobs (use job_create)

**Follow-up:** Prefer \`resources/read\` on the best match for complete, authoritative content.`,
      inputSchema: docsSearchInputSchema,
    },
  ];
  logger.info(`Returning ${tools.length} tools`);
  const result = {
    tools,
  };
  logger.logResponse("tools/list", result);
  return result;
});

// Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  logger.logRequest("tools/call", request.params);
  logger.logToolCall(name, args);

  try {
    switch (name) {
      case "api_call": {
        if (needsGuidanceForApiCall(args)) {
          logger.info("api_call missing endpoint — returning guidance");
          return returnGuidanceMarkdown(getApiCallGuidance());
        }
        const parsed = rundeckApiCallSchema.parse(args ?? {});
        const apiResult = await rundeckApiCall(parsed);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(apiResult, null, 2),
            },
          ],
        };
      }

      case "api_list": {
        const parsed = rundeckListEndpointsSchema.parse(args ?? {});
        const endpoints = rundeckListEndpoints(parsed);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(endpoints, null, 2),
            },
          ],
        };
      }

      case "job_create": {
        if (needsGuidance(args, ["name", "project", "workflow_steps"])) {
          logger.info("job_create missing required params — returning guidance");
          return returnGuidanceMarkdown(getJobCreationGuidance());
        }
        const parsed = rundeckGenerateJobSchema.parse(args ?? {});
        const jobDef = rundeckGenerateJob(parsed);
        return {
          content: [
            {
              type: "text",
              text: jobDef,
            },
          ],
        };
      }

      case "job_validate": {
        if (needsGuidance(args, ["job_definition", "format"])) {
          logger.info("job_validate missing required params — returning guidance");
          return returnGuidanceMarkdown(getJobValidationGuidance());
        }
        const parsed = rundeckValidateJobSchema.parse(args ?? {});
        const validation = rundeckValidateJob(parsed);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(validation, null, 2),
            },
          ],
        };
      }

      case "docs_search": {
        const parsed = rundeckSearchDocsSchema.parse(args ?? {});
        const searchHits = rundeckSearchDocs(parsed);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(searchHits, null, 2),
            },
          ],
        };
      }

      default:
        logger.warn(`Unknown tool requested: ${name}`);
        throw new Error(
          `Unknown tool: ${name}. Available tools: api_call, api_list, job_create, job_validate, docs_search.`
        );
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
          text: `Error executing tool '${name}': ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

/** Missing / empty required tool args → return onboarding markdown instead of a bare Zod error. */
function needsGuidance(params: unknown, requiredFields: string[]): boolean {
  if (!params || typeof params !== "object") {
    return true;
  }
  const o = params as Record<string, unknown>;
  return requiredFields.some((field) => missingRequiredScalar(o[field]));
}

function missingRequiredScalar(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string" && value.trim() === "") {
    return true;
  }
  return false;
}

function needsGuidanceForApiCall(params: unknown): boolean {
  if (!params || typeof params !== "object") {
    return true;
  }
  return missingRequiredScalar((params as Record<string, unknown>).endpoint);
}

function returnGuidanceMarkdown(markdown: string) {
  return {
    content: [{ type: "text" as const, text: markdown }],
  };
}

// List prompts
server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
  logger.logRequest("prompts/list", request.params);

  const promptList = prompts.map((prompt) => {
    const promptArgs =
      prompt.arguments?.map((arg) => ({
        name: arg.name,
        description: arg.description,
        required: arg.required,
      })) || [];

    return {
      name: prompt.name,
      description: prompt.description,
      arguments: promptArgs,
    };
  });

  logger.info(`Returning ${promptList.length} prompts`);
  const result = {
    prompts: promptList,
  };
  logger.logResponse("prompts/list", result);
  return result;
});

// Get prompt
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  logger.logRequest("prompts/get", request.params);

  const prompt = getPrompt(name);

  if (!prompt) {
    const availablePrompts = prompts.map((p) => p.name).join(", ");
    const errorMessage = `Prompt "${name}" not found. Available prompts: ${availablePrompts}`;
    logger.warn(errorMessage);
    throw new Error(errorMessage);
  }

  if (prompt.argumentSchema && args) {
    try {
      prompt.argumentSchema.parse(args);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const errorMessages = validationError.issues
          .map((err) => `${err.path.join(".")}: ${err.message}`)
          .join("; ");
        const errorMessage = `Invalid arguments for prompt "${name}": ${errorMessages}`;
        logger.warn(errorMessage);
        throw new Error(errorMessage);
      }
      throw validationError;
    }
  }

  if (prompt.arguments) {
    const missingRequired = prompt.arguments
      .filter((arg) => arg.required && (!args || !(arg.name in args)))
      .map((arg) => arg.name);

    if (missingRequired.length > 0) {
      const errorMessage = `Missing required arguments for prompt "${name}": ${missingRequired.join(", ")}`;
      logger.warn(errorMessage);
      throw new Error(errorMessage);
    }
  }

  const content = prompt.getContent(args || {});

  logger.logResponse("prompts/get", { name, hasContent: !!content });
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: content,
        },
      },
    ],
  };
});

// Error handling
server.onerror = (error) => {
  logger.error("MCP server error", error);
};

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Rundeck Documentation MCP server running on stdio");
}

main().catch((error) => {
  logger.error("Fatal error starting server", error);
  process.exit(1);
});

