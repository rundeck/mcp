/**
 * Tool recommendation tool
 * Helps entities decide which tool to use based on their intent
 */

import { z } from "zod";

interface ToolRecommendation {
  tool: string;
  confidence: number;
  reasoning: string;
  whenToUse: string;
  whenNotToUse: string;
}

/**
 * Recommend tools based on user intent
 */
export function toolRecommend(params: {
  intent: string;
}): {
  recommendations: ToolRecommendation[];
  alternativeResources?: string[];
} {
  const intentLower = params.intent.toLowerCase();
  const recommendations: ToolRecommendation[] = [];
  const alternativeResources: string[] = [];

  // Tool metadata for matching
  const toolMetadata: Record<string, {
    keywords: string[];
    description: string;
    whenToUse: string;
    whenNotToUse: string;
  }> = {
    api_call: {
      keywords: ["api", "call", "request", "http", "get", "post", "put", "delete", "endpoint", "query", "execute", "trigger", "run job", "list projects", "list jobs"],
      description: "Execute a Rundeck API call",
      whenToUse: "Making API requests to Rundeck, querying data, triggering job executions, managing resources programmatically",
      whenNotToUse: "Reading documentation, creating job definitions, validating jobs",
    },
    api_list: {
      keywords: ["list", "endpoints", "discover", "available", "api endpoints", "what endpoints", "api structure"],
      description: "List available API endpoints",
      whenToUse: "Discovering available API endpoints, finding endpoints for specific categories, understanding API structure",
      whenNotToUse: "Making actual API calls, reading API documentation",
    },
    job_create: {
      keywords: ["create", "generate", "job", "yaml", "json", "job definition", "new job", "build job", "make job"],
      description: "Generate a Rundeck job definition",
      whenToUse: "Creating new job definitions, generating job YAML/JSON for import, building jobs programmatically",
      whenNotToUse: "Validating existing jobs, making API calls, reading job documentation",
    },
    job_validate: {
      keywords: ["validate", "check", "verify", "job", "syntax", "schema", "error", "debug", "test job"],
      description: "Validate a job definition",
      whenToUse: "Validating job YAML/JSON before importing, checking syntax and structure, debugging job errors",
      whenNotToUse: "Creating job definitions, making API calls, reading job schema",
    },
    plugin_create: {
      keywords: ["create", "generate", "plugin", "node-step", "workflow-step", "file-copier", "notification", "custom plugin", "java", "groovy"],
      description: "Generate Rundeck plugin code",
      whenToUse: "Creating new Rundeck plugins, generating plugin boilerplate code, developing custom functionality",
      whenNotToUse: "Using existing plugins, configuring plugins, reading plugin documentation",
    },
  };

  // Calculate relevance scores for each tool
  for (const [toolName, metadata] of Object.entries(toolMetadata)) {
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const keyword of metadata.keywords) {
      if (intentLower.includes(keyword)) {
        score += 10;
        matchedKeywords.push(keyword);
      }
    }

    // Boost score for exact phrase matches
    if (intentLower.includes(toolName.replace("_", " "))) {
      score += 20;
    }

    // Boost score for common patterns
    if (intentLower.includes("how to") && metadata.keywords.some(k => intentLower.includes(k))) {
      score += 5;
    }

    if (score > 0) {
      recommendations.push({
        tool: toolName,
        confidence: Math.min(100, score),
        reasoning: `Matched keywords: ${matchedKeywords.join(", ")}. ${metadata.description}`,
        whenToUse: metadata.whenToUse,
        whenNotToUse: metadata.whenNotToUse,
      });
    }
  }

  // Check if intent is about documentation/resources
  const docKeywords = ["documentation", "docs", "read", "learn", "guide", "example", "tutorial", "how to", "reference"];
  if (docKeywords.some(k => intentLower.includes(k))) {
    alternativeResources.push("rundeck://docs/manual");
    alternativeResources.push("rundeck://docs/learning");
    alternativeResources.push("rundeck://api");
  }

  // Sort by confidence
  recommendations.sort((a, b) => b.confidence - a.confidence);

  // If no strong matches, suggest resources
  if (recommendations.length === 0 || recommendations[0].confidence < 20) {
    alternativeResources.push("rundeck://docs/manual");
    alternativeResources.push("Use tool_recommend with more specific intent");
  }

  return {
    recommendations: recommendations.slice(0, 3), // Top 3 recommendations
    alternativeResources: alternativeResources.length > 0 ? alternativeResources : undefined,
  };
}

// Zod schema
export const toolRecommendSchema = z.object({
  intent: z.string().describe("Description of what you want to accomplish (e.g., 'I want to create a job that runs a command', 'How do I call the API to list projects?', 'Validate my job YAML')"),
});

