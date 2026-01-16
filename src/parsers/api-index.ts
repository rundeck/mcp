/**
 * Parser for API index documentation
 */

import { parseMarkdown, ParsedMarkdown } from "./markdown.js";

export interface ApiEndpoint {
  path: string;
  method: string;
  description?: string;
  category?: string;
}

/**
 * Convert kebab-case anchor text to readable description
 * Example: "list-scm-plugins" -> "List SCM plugins"
 */
function anchorToDescription(anchor: string): string {
  return anchor
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Determine category from endpoint path with improved heuristics
 */
function determineCategory(path: string, method: string): string {
  const lowerPath = path.toLowerCase();
  const lowerMethod = method.toLowerCase();

  // Authentication endpoints
  if (lowerPath.includes("/token") || lowerPath.includes("/tokens") || 
      lowerPath.includes("/auth") || lowerPath.includes("/user")) {
    return "authentication";
  }

  // Job endpoints
  if (lowerPath.includes("/job/") || lowerPath.includes("/jobs")) {
    return "jobs";
  }

  // Project endpoints
  if (lowerPath.includes("/project/") || lowerPath.includes("/projects")) {
    return "projects";
  }

  // Execution endpoints
  if (lowerPath.includes("/execution/") || lowerPath.includes("/executions")) {
    return "executions";
  }

  // System endpoints
  if (lowerPath.includes("/system/") || lowerPath.includes("/metrics") ||
      lowerPath.includes("/feature/") || lowerPath.includes("/config/refresh")) {
    return "system";
  }

  // Runner management
  if (lowerPath.includes("/runner")) {
    return "system";
  }

  // Webhooks
  if (lowerPath.includes("/webhook")) {
    return "general";
  }

  // Storage
  if (lowerPath.includes("/storage")) {
    return "general";
  }

  // SCM (Source Control Management)
  if (lowerPath.includes("/scm")) {
    return "projects";
  }

  // Scheduler
  if (lowerPath.includes("/scheduler")) {
    return "system";
  }

  return "general";
}

/**
 * Parse API index file to extract endpoint information
 */
export function parseApiIndex(filePathOrContent: string): ApiEndpoint[] {
  // If it looks like a file path, read it; otherwise treat as content
  let content: string;
  if (filePathOrContent.includes('\n') || filePathOrContent.startsWith('#')) {
    // Looks like content
    content = filePathOrContent;
  } else {
    // Looks like a file path
    const parsed = parseMarkdown(filePathOrContent);
    content = parsed.content;
  }
  
  const endpoints: ApiEndpoint[] = [];
  const seenPaths = new Set<string>(); // Track duplicates

  // Pattern 1: Markdown link format: [/api/V/...]:/api/index.md#anchor-text
  // Pattern 2: Direct format: [GET /api/V/...] or [/api/V/...]
  // Pattern 3: Link with method: [GET /api/V/...]:/api/index.md#anchor-text
  
  // First, try to match markdown link format with anchor
  const linkRegex = /\[(?:(\w+)\s+)?(\/api\/\d+\/[^\]]+|\/api\/V\/[^\]]+)\]:([^\s]+)#([^\s\]]+)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const method = match[1] || "GET";
    const path = match[2];
    const anchor = match[4];
    
    // Create unique key for deduplication
    const key = `${method}:${path}`;
    if (seenPaths.has(key)) {
      continue;
    }
    seenPaths.add(key);

    // Convert anchor to readable description
    const description = anchorToDescription(anchor);

    const category = determineCategory(path, method);

    endpoints.push({
      path,
      method: method.toUpperCase(),
      description,
      category,
    });
  }

  // Then, match direct format (without link): [GET /api/V/...] or [/api/V/...]
  const directRegex = /\[(?:(\w+)\s+)?(\/api\/\d+\/[^\]]+|\/api\/V\/[^\]]+)\](?!:)/g;
  let directMatch;

  while ((directMatch = directRegex.exec(content)) !== null) {
    const method = directMatch[1] || "GET";
    const path = directMatch[2];
    
    // Skip if we already have this endpoint from link format
    const key = `${method}:${path}`;
    if (seenPaths.has(key)) {
      continue;
    }
    seenPaths.add(key);

    // Try to find description in following lines
    let description = "";
    const matchIndex = directMatch.index || 0;
    const lines = content.substring(matchIndex).split("\n");
    for (let i = 1; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      if (line && !line.match(/^\[/) && !line.match(/^#/) && !line.match(/^:/)) {
        description = line;
        break;
      }
    }

    const category = determineCategory(path, method);

    endpoints.push({
      path,
      method: method.toUpperCase(),
      description: description || undefined,
      category,
    });
  }

  return endpoints;
}

/**
 * Find endpoint documentation by path
 */
export function findEndpointDocumentation(
  apiIndexContent: string,
  endpointPath: string
): string | null {
  // Look for anchor links or sections related to this endpoint
  const normalizedPath = endpointPath.replace(/\[.*?\]/g, "[...]");
  const pathPattern = normalizedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Try to find the section containing this endpoint
  const lines = apiIndexContent.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line contains the endpoint
    if (line.includes(endpointPath) || new RegExp(pathPattern).test(line)) {
      inSection = true;
      // Include some context before
      if (i > 0) {
        sectionLines.push(lines[i - 1]);
      }
    }

    if (inSection) {
      sectionLines.push(line);

      // Stop at next major heading or after reasonable amount of content
      if (
        line.match(/^##\s/) &&
        sectionLines.length > 5 &&
        !line.includes(endpointPath)
      ) {
        break;
      }
    }
  }

  return sectionLines.length > 0 ? sectionLines.join("\n") : null;
}

