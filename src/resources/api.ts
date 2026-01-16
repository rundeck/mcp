/**
 * API documentation resources
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parseMarkdown, extractSection } from "../parsers/markdown.js";
import { parseApiIndex, findEndpointDocumentation } from "../parsers/api-index.js";
import { configManager } from "../config.js";

function getDocsPath(): string {
  return configManager.getConfig().docsPath;
}

/**
 * Get API index resource
 */
export function getApiIndex(): string {
  const indexPath = join(getDocsPath(), "api", "index.md");
  if (!existsSync(indexPath)) {
    throw new Error(`API index not found at ${indexPath}`);
  }
  return readFileSync(indexPath, "utf-8");
}

/**
 * Get API authentication documentation
 */
export function getApiAuthentication(): string {
  const apiIndex = getApiIndex();
  const authSection = extractSection(apiIndex, "Authentication");
  if (authSection) {
    return authSection;
  }

  // Fallback: read from api_basics.md
  const basicsPath = join(getDocsPath(), "api", "api_basics.md");
  if (existsSync(basicsPath)) {
    const content = readFileSync(basicsPath, "utf-8");
    const authSection = extractSection(content, "Authentication");
    if (authSection) {
      return authSection;
    }
    return content;
  }

  return "Authentication documentation not found";
}

/**
 * Get specific API endpoint documentation
 */
export function getApiEndpoint(endpointPath: string): string {
  const apiIndex = getApiIndex();
  const endpointDoc = findEndpointDocumentation(apiIndex, endpointPath);

  if (endpointDoc) {
    return endpointDoc;
  }

  // Try to find in api-index-links.md
  const linksPath = join(getDocsPath(), "api", "api-index-links.md");
  if (existsSync(linksPath)) {
    const linksContent = readFileSync(linksPath, "utf-8");
    if (linksContent.includes(endpointPath)) {
      return `Endpoint: ${endpointPath}\n\nSee API index for full documentation.\n\n${linksContent}`;
    }
  }

  return `Endpoint documentation for ${endpointPath} not found. Check the API index for available endpoints.`;
}

/**
 * Get API examples
 */
export function getApiExamples(): string {
  const basicsPath = join(getDocsPath(), "api", "api_basics.md");
  if (existsSync(basicsPath)) {
    return readFileSync(basicsPath, "utf-8");
  }
  return "API examples not found";
}

/**
 * List all API endpoints
 */
export function listApiEndpoints(category?: string): Array<{
  path: string;
  method: string;
  description?: string;
  category?: string;
}> {
  try {
    const linksPath = join(getDocsPath(), "api", "api-index-links.md");
    if (existsSync(linksPath)) {
      const endpoints = parseApiIndex(linksPath);
      if (category) {
        return endpoints.filter((e) => e.category === category);
      }
      return endpoints;
    }

    // Fallback: parse from main index
    const indexPath = join(getDocsPath(), "api", "index.md");
    if (existsSync(indexPath)) {
      const endpoints = parseApiIndex(indexPath);
      if (category) {
        return endpoints.filter((e) => e.category === category);
      }
      return endpoints;
    }

    return [];
  } catch (error) {
    // Log error but return empty array to prevent tool failure
    console.error("Error parsing API index:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

