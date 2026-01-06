/**
 * Summarization utilities for large documentation resources
 * Helps optimize context window usage by providing summaries and key sections
 */

import { ParsedMarkdown, parseMarkdownContent, extractSection } from "../parsers/markdown.js";

const MAX_RESOURCE_TOKENS = 50000; // Approximate max tokens per resource
const TOKENS_PER_CHAR = 0.25; // Rough estimate: 4 chars per token

/**
 * Estimate token count for text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

/**
 * Summarize a markdown document by extracting key sections
 */
export function summarizeMarkdown(content: string, maxTokens: number = MAX_RESOURCE_TOKENS): string {
  const parsed = parseMarkdownContent(content);
  const estimatedTokens = estimateTokens(content);

  // If content is within limits, return as-is
  if (estimatedTokens <= maxTokens) {
    return content;
  }

  // Extract key sections: title, TOC (headings), first paragraphs, code blocks
  const summary: string[] = [];

  // Add title
  if (parsed.title) {
    summary.push(`# ${parsed.title}\n`);
  }

  // Add table of contents from headings
  if (parsed.headings.length > 0) {
    summary.push("## Table of Contents\n");
    for (const heading of parsed.headings.slice(0, 50)) { // Limit TOC size
      const indent = "  ".repeat(Math.max(0, heading.level - 1));
      summary.push(`${indent}- ${heading.text}`);
    }
    summary.push("");
  }

  // Add first few paragraphs (introduction)
  const lines = content.split("\n");
  let paragraphCount = 0;
  let inCodeBlock = false;
  
  for (let i = 0; i < lines.length && paragraphCount < 5; i++) {
    const line = lines[i];
    
    // Track code blocks
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    
    if (!inCodeBlock && line.trim().length > 0 && !line.trim().startsWith("#")) {
      summary.push(line);
      if (line.trim().endsWith(".") || line.trim().endsWith("!")) {
        paragraphCount++;
      }
    }
  }

  summary.push("\n---\n");
  summary.push(`*[Document truncated. Full document has ${estimatedTokens.toLocaleString()} estimated tokens. Use specific section resources for detailed content.]\n`);

  return summary.join("\n");
}

/**
 * Extract key sections from markdown for summarization
 */
export function extractKeySections(content: string, sectionNames: string[]): string {
  const sections: string[] = [];
  
  for (const sectionName of sectionNames) {
    const section = extractSection(content, sectionName);
    if (section) {
      sections.push(section);
    }
  }
  
  return sections.join("\n\n---\n\n");
}

/**
 * Create a resource summary that links to detailed resources
 */
export function createResourceSummary(
  title: string,
  description: string,
  relatedResources: Array<{ uri: string; description: string }>
): string {
  const summary: string[] = [];
  
  summary.push(`# ${title}\n`);
  summary.push(`${description}\n`);
  
  if (relatedResources.length > 0) {
    summary.push("## Related Resources\n");
    for (const resource of relatedResources) {
      summary.push(`- **${resource.uri}**: ${resource.description}`);
    }
  }
  
  return summary.join("\n");
}

/**
 * Group related markdown files into a single resource
 */
export function groupMarkdownFiles(
  files: Array<{ path: string; content: string }>,
  maxTokens: number = MAX_RESOURCE_TOKENS
): string {
  const grouped: string[] = [];
  let currentTokens = 0;
  
  for (const file of files) {
    const fileTokens = estimateTokens(file.content);
    
    // If adding this file would exceed limit, summarize it
    if (currentTokens + fileTokens > maxTokens) {
      const summary = summarizeMarkdown(file.content, maxTokens - currentTokens);
      grouped.push(`## ${file.path}\n\n${summary}`);
      currentTokens += estimateTokens(summary);
    } else {
      grouped.push(`## ${file.path}\n\n${file.content}`);
      currentTokens += fileTokens;
    }
    
    // Stop if we've reached the limit
    if (currentTokens >= maxTokens) {
      break;
    }
  }
  
  return grouped.join("\n\n---\n\n");
}

