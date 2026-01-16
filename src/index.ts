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
  toolRecommend,
  toolRecommendSchema,
} from "./tools/recommend.js";
import {
  pluginCreate,
  pluginCreateSchema,
} from "./tools/plugins.js";
import { configManager } from "./config.js";
import { logger } from "./utils/logger.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { JsonSchema7Type } from "zod-to-json-schema";
import {
  getJobCreationGuidance,
  getApiCallGuidance,
  getProjectConfigGuidance,
  getNodeFilterGuidance,
  getPluginIntegrationGuidance,
  getPluginCreationGuidance,
} from "./utils/guidance.js";
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
Call without required params for setup guidance.`,
      inputSchema: convertSchema(rundeckApiCallSchema),
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
      inputSchema: convertSchema(rundeckListEndpointsSchema),
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

**Guidance Mode:** Call without required params (name, project, workflow_steps) to get step-by-step guidance on job creation.
**Resources:** See rundeck://docs/manual/jobs for comprehensive job documentation.`,
      inputSchema: convertSchema(rundeckGenerateJobSchema),
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

**Guidance Mode:** Call without required params (job_definition, format) to get validation guidance.
**Output:** Returns validation result with errors and warnings.`,
      inputSchema: convertSchema(rundeckValidateJobSchema),
    },
    {
      name: "tool_recommend",
      description: `Recommend which tool to use based on your intent or goal.

**When to use:**
- Unsure which tool to use for a task
- Want to discover available tools for a specific goal
- Need guidance on tool selection

**When NOT to use:**
- You already know which tool to use
- Looking for documentation (use resources instead: rundeck://docs/*)

**Example:** Call with intent: "I want to create a job that runs a command" to get recommendations.
**Output:** Returns ranked list of recommended tools with reasoning and when to use each.`,
      inputSchema: convertSchema(toolRecommendSchema),
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

**Guidance Mode:** Call without required params (plugin_type, name, class_name) to get step-by-step guidance on plugin creation.
**Resources:** See rundeck://docs/developer/plugins for comprehensive plugin documentation.`,
      inputSchema: convertSchema(pluginCreateSchema),
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
      case "api_call":
        // Check for guidance mode (missing required params - endpoint is required, method has default)
        if (needsGuidance(args, ["endpoint"])) {
          logger.info("api_call called without required params - returning guidance");
          return returnGuidance(getApiCallGuidance());
        }
        const apiResult = await rundeckApiCall(args as any);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(apiResult, null, 2),
            },
          ],
        };

      case "api_list":
        const endpoints = rundeckListEndpoints(args as any);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(endpoints, null, 2),
            },
          ],
        };

      case "job_create":
        // Check for guidance mode (missing required params)
        if (needsGuidance(args, ["name", "project", "workflow_steps"])) {
          logger.info("job_create called without required params - returning guidance");
          return returnGuidance(getJobCreationGuidance());
        }
        const jobDef = rundeckGenerateJob(args as any);
        return {
          content: [
            {
              type: "text",
              text: jobDef,
            },
          ],
        };

      case "job_validate":
        // Check for guidance mode (missing required params)
        if (needsGuidance(args, ["job_definition", "format"])) {
          logger.info("job_validate called without required params - returning guidance");
          return returnGuidance(`# Validating a Rundeck Job

## Overview
Validate a Rundeck job definition to ensure it follows the correct schema and format.

## Required Parameters
- **job_definition** (string): The job definition as a YAML or JSON string
- **format** ("yaml" | "json"): The format of the job definition

## Usage Example
\`\`\`
job_validate({
  job_definition: "name: My Job\\nproject: my-project\\n...",
  format: "yaml"
})
\`\`\`

## Resources
- Job Schema: \`rundeck://jobs/schema\`
- Job Creation Guide: Call \`job_create\` without parameters`);
        }
        const validation = rundeckValidateJob(args as any);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(validation, null, 2),
            },
          ],
        };

      case "tool_recommend":
        const recommendations = toolRecommend(args as any);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(recommendations, null, 2),
            },
          ],
        };

      case "plugin_create":
        // Check for guidance mode (missing required params)
        if (needsGuidance(args, ["plugin_type", "name", "class_name"])) {
          logger.info("plugin_create called without required params - returning guidance");
          return returnGuidance(getPluginCreationGuidance());
        }
        try {
          const pluginResult = pluginCreate(args as any);
          const responseText = pluginResult.warnings 
            ? `# Generated Plugin Code\n\n\`\`\`java\n${pluginResult.code}\n\`\`\`\n\n## Warnings\n${pluginResult.warnings.map(w => `- ${w}`).join("\n")}`
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

      default:
        logger.warn(`Unknown tool requested: ${name}`);
        throw new Error(`Unknown tool: ${name}. Available tools: api_call, api_list, job_create, job_validate, tool_recommend, plugin_create. Use tool_recommend to find the right tool for your task.`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
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
    const promptArgs = prompt.arguments?.map((arg) => ({
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
  
  try {
    // Find prompt
    const prompt = getPrompt(name);
    
    if (!prompt) {
      const availablePrompts = prompts.map((p) => p.name).join(", ");
      const errorMessage = `Prompt "${name}" not found. Available prompts: ${availablePrompts}`;
      logger.warn(errorMessage);
      return {
        content: [
          {
            type: "text",
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }
    
    // Validate arguments if schema exists
    if (prompt.argumentSchema && args) {
      try {
        prompt.argumentSchema.parse(args);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          const errorMessages = validationError.errors.map((err) => 
            `${err.path.join(".")}: ${err.message}`
          ).join("; ");
          const errorMessage = `Invalid arguments for prompt "${name}": ${errorMessages}`;
          logger.warn(errorMessage);
          return {
            content: [
              {
                type: "text",
                text: errorMessage,
              },
            ],
            isError: true,
          };
        }
      }
    }
    
    // Check for missing required arguments
    if (prompt.arguments) {
      const missingRequired = prompt.arguments
        .filter((arg) => arg.required && (!args || !(arg.name in args)))
        .map((arg) => arg.name);
      
      if (missingRequired.length > 0) {
        const errorMessage = `Missing required arguments for prompt "${name}": ${missingRequired.join(", ")}`;
        logger.warn(errorMessage);
        return {
          content: [
            {
              type: "text",
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }
    }
    
    // Generate prompt content
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting prompt "${name}":`, errorMessage);
    return {
      content: [
        {
          type: "text",
          text: `Error retrieving prompt "${name}": ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Prompts are now registered as first-class MCP feature
// Guidance mode in tools provides similar functionality when tools are called without required params

/**
 * Helper function to check if required fields are missing
 */
function needsGuidance(params: unknown, requiredFields: string[]): boolean {
  if (!params || typeof params !== "object") {
    return true;
  }
  
  const args = params as Record<string, unknown>;
  return requiredFields.some((field) => !(field in args) || args[field] === undefined || args[field] === null);
}

/**
 * Helper function to format guidance as tool response
 */
function returnGuidance(guidanceContent: string) {
  return {
    content: [
      {
        type: "text",
        text: guidanceContent,
      },
    ],
  };
}

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

