/**
 * Documentation search tools
 *
 * `rundeckGetExample` / `rundeckGetExampleSchema` are retained for possible reuse; they are
 * not registered as an MCP `docs_example` tool in Phase 1 (use `docs_search` + resources).
 */

import { z } from "zod";
import { findMarkdownFiles, parseMarkdownContent } from "../parsers/markdown.js";
import { configManager } from "../config.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function getDocsPath(): string {
  return configManager.getConfig().docsPath;
}

interface SearchResult {
  file: string;
  title: string;
  excerpt: string;
  relevance: number;
}

/**
 * Search documentation content
 */
export function rundeckSearchDocs(params: {
  query: string;
  category?: string;
}): Array<{
  title: string;
  content: string;
  file: string;
  relevance: number;
}> {
  const queryLower = params.query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 0);
  const results: SearchResult[] = [];

  // Determine search directory based on category
  let searchDir = getDocsPath();
  if (params.category) {
    const categoryMap: Record<string, string> = {
      api: join(getDocsPath(), "api"),
      jobs: join(getDocsPath(), "manual", "jobs"),
      config: join(getDocsPath(), "administration", "configuration"),
      learning: join(getDocsPath(), "learning"),
      plugins: join(getDocsPath(), "manual", "plugins"),
    };
    if (categoryMap[params.category]) {
      searchDir = categoryMap[params.category];
    }
  }

  if (!existsSync(searchDir)) {
    return [];
  }

  const files = findMarkdownFiles(searchDir);

  for (const file of files) {
    try {
      const content = readFileSync(file, "utf-8");
      const parsed = parseMarkdownContent(content);

      // Calculate relevance score
      let relevance = 0;
      const contentLower = content.toLowerCase();
      const titleLower = parsed.title.toLowerCase();

      // Title matches are worth more
      for (const term of queryTerms) {
        if (titleLower.includes(term)) {
          relevance += 10;
        }
        if (contentLower.includes(term)) {
          relevance += 1;
        }
      }

      // Exact phrase match
      if (contentLower.includes(queryLower)) {
        relevance += 5;
      }

      if (relevance > 0) {
        // Extract excerpt around first match
        const index = contentLower.indexOf(queryLower);
        let excerpt = "";
        if (index >= 0) {
          const start = Math.max(0, index - 100);
          const end = Math.min(content.length, index + queryLower.length + 200);
          excerpt = content.substring(start, end);
          if (start > 0) excerpt = "..." + excerpt;
          if (end < content.length) excerpt = excerpt + "...";
        } else {
          // Use first paragraph or first 300 chars
          const firstPara = content.split("\n\n").find((p: string) => p.trim().length > 0);
          excerpt = firstPara ? firstPara.substring(0, 300) : content.substring(0, 300);
          if (excerpt.length < content.length) excerpt += "...";
        }

        results.push({
          file,
          title: parsed.title,
          excerpt,
          relevance,
        });
      }
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }

  // Sort by relevance
  results.sort((a, b) => b.relevance - a.relevance);

  // Return top 20 results
  return results.slice(0, 20).map((r) => ({
    title: r.title,
    content: r.excerpt,
    file: r.file.replace(getDocsPath(), ""),
    relevance: r.relevance,
  }));
}

/**
 * Get code examples for a specific topic
 */
export function rundeckGetExample(params: {
  topic: string;
}): string {
  const topicLower = params.topic.toLowerCase();

  // Map topics to example files
  const exampleMap: Record<string, string[]> = {
    "api-job-run": [
      join(getDocsPath(), "api", "api_basics.md"),
      join(getDocsPath(), "learning", "howto", "calling-apis.md"),
    ],
    "job-yaml-basic": [
      join(getDocsPath(), "manual", "document-format-reference", "job-yaml-v12.md"),
      join(getDocsPath(), "learning", "getting-started", "jobs", "creating-a-job.md"),
    ],
    "node-filter": [
      join(getDocsPath(), "manual", "11-node-filters.md"),
      join(getDocsPath(), "learning", "getting-started", "jobs", "pieces-of-a-job.md"),
    ],
    "job-options": [
      join(getDocsPath(), "manual", "jobs", "job-options.md"),
      join(getDocsPath(), "manual", "document-format-reference", "job-yaml-v12.md"),
    ],
    "workflow-steps": [
      join(getDocsPath(), "manual", "jobs", "job-workflows.md"),
      join(getDocsPath(), "manual", "document-format-reference", "job-yaml-v12.md"),
    ],
  };

  const files = exampleMap[topicLower] || [];

  // Try to find examples in common locations
  if (files.length === 0) {
    const commonPaths = [
      join(getDocsPath(), "learning", "howto"),
      join(getDocsPath(), "learning", "getting-started"),
      join(getDocsPath(), "manual"),
    ];

    for (const basePath of commonPaths) {
      if (existsSync(basePath)) {
        const allFiles = findMarkdownFiles(basePath);
        for (const file of allFiles) {
          const content = readFileSync(file, "utf-8").toLowerCase();
          if (content.includes(topicLower) || file.toLowerCase().includes(topicLower)) {
            files.push(file);
            break;
          }
        }
      }
    }
  }

  if (files.length === 0) {
    return `No examples found for topic: ${params.topic}`;
  }

  // Read and combine examples from found files
  const examples: string[] = [];
  for (const file of files) {
    if (existsSync(file)) {
      try {
        const content = readFileSync(file, "utf-8");
        const parsed = parseMarkdownContent(content);

        // Extract code blocks
        if (parsed.codeBlocks.length > 0) {
          examples.push(`## Examples from ${file.replace(getDocsPath(), "")}\n\n`);
          for (const block of parsed.codeBlocks) {
            if (block.language) {
              examples.push(`\`\`\`${block.language}\n${block.code}\n\`\`\`\n\n`);
            } else {
              examples.push(`\`\`\`\n${block.code}\n\`\`\`\n\n`);
            }
          }
        } else {
          // Include relevant section
          examples.push(`## Content from ${file.replace(getDocsPath(), "")}\n\n${content.substring(0, 2000)}\n\n`);
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }
  }

  return examples.length > 0
    ? examples.join("\n")
    : `No code examples found for topic: ${params.topic}`;
}

// Zod schemas
export const rundeckSearchDocsSchema = z.object({
  query: z.string().describe("Search query"),
  category: z.enum(["api", "jobs", "config", "learning", "plugins"]).optional().describe("Limit search to specific category"),
});

export const rundeckGetExampleSchema = z.object({
  topic: z.string().describe("Topic to get examples for (e.g., 'api-job-run', 'job-yaml-basic', 'node-filter')"),
});

