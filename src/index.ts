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
  pluginCreate,
  pluginCreateSchema,
} from "./tools/plugins.js";
import {
  rundeckSearchDocs,
  rundeckSearchDocsSchema,
  rundeckGetExample,
  rundeckGetExampleSchema,
} from "./tools/search.js";
import { configManager } from "./config.js";
import { logger } from "./utils/logger.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { JsonSchema7Type } from "zod-to-json-schema";
import { prompts, getPrompt } from "./prompts/index.js";

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
const docsExampleInputSchema = convertSchema(rundeckGetExampleSchema);
const pluginCreateInputSchema = convertSchema(pluginCreateSchema);

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
Guided flows: MCP prompts \`setup-authentication\` and \`call-api\`.`,
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

**Output:** Returns validation result with errors and warnings.`,
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
- Generating jobs or plugins (use job_create or plugin_create)

**Follow-up:** Prefer \`resources/read\` on the best match for complete, authoritative content.`,
      inputSchema: docsSearchInputSchema,
    },
    {
      name: "docs_example",
      description: `Extract code-block examples from local Rundeck documentation for a known topic slug.

**When to use:**
- You want runnable or copy-paste examples for a topic such as \`api-job-run\`, \`job-yaml-basic\`, or \`node-filter\`
- \`docs_search\` narrowed the file and you need concrete snippets

**When NOT to use:**
- Full-document reading (use \`resources/read\` with a \`rundeck://...\` URI)
- Free-text exploration (use \`docs_search\`)

**Parameter \`topic\`:** Use short topic keys (e.g. \`api-job-run\`, \`workflow-steps\`) or terms to match doc paths.`,
      inputSchema: docsExampleInputSchema,
    },
    {
      name: "plugin_create",
      description: `Generate a Rundeck plugin code in Java or Groovy.

**When to use:**
- Creating new Rundeck plugins (node steps, workflow steps, file copiers, notifications)
- Generating plugin code following Rundeck conventions
- Building plugins programmatically

**When NOT to use:**
- Reading plugin documentation (use resources instead: rundeck://docs/developer/*)
- Creating job definitions (use job_create instead)
- Making API calls (use api_call instead)

**Supported plugin types:**
- node-step: Executes on each node in a workflow
- workflow-step: Executes once per workflow
- remote-script-node-step: Generates script/command for remote execution
- file-copier: Copies files to nodes
- notification: Sends notifications on job events

For a guided flow, open the MCP prompt \`integrate-plugin\` (or \`create-job\` when embedding plugins in jobs).
**Resources:** See rundeck://docs/developer/plugins for comprehensive plugin documentation.`,
      inputSchema: pluginCreateInputSchema,
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

      case "docs_example": {
        const parsed = rundeckGetExampleSchema.parse(args ?? {});
        const exampleText = rundeckGetExample(parsed);
        return {
          content: [
            {
              type: "text",
              text: exampleText,
            },
          ],
        };
      }

      case "plugin_create": {
        const parsed = pluginCreateSchema.parse(args ?? {});
        try {
          const pluginResult = pluginCreate(parsed);
          const responseText = pluginResult.warnings
            ? `# Generated Plugin Code\n\n\`\`\`java\n${pluginResult.code}\n\`\`\`\n\n## Warnings\n${pluginResult.warnings.map((w) => `- ${w}`).join("\n")}`
            : `# Generated Plugin Code\n\n\`\`\`java\n${pluginResult.code}\n\`\`\``;
          return {
            content: [
              {
                type: "text",
                text: responseText,
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Plugin creation failed: ${errorMessage}`);
        }
      }

      default:
        logger.warn(`Unknown tool requested: ${name}`);
        throw new Error(
          `Unknown tool: ${name}. Available tools: api_call, api_list, job_create, job_validate, docs_search, docs_example, plugin_create.`
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

