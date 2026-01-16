/**
 * Markdown parsing utilities for extracting structured information
 */

import { marked } from "marked";
import { readFileSync } from "fs";
import { join } from "path";

export interface ParsedMarkdown {
  title: string;
  content: string;
  headings: Heading[];
  codeBlocks: CodeBlock[];
  links: Link[];
}

export interface Heading {
  level: number;
  text: string;
  id?: string;
}

export interface CodeBlock {
  language?: string;
  code: string;
}

export interface Link {
  text: string;
  href: string;
}

/**
 * Parse a markdown file and extract structured information
 */
export function parseMarkdown(filePath: string): ParsedMarkdown {
  const content = readFileSync(filePath, "utf-8");
  return parseMarkdownContent(content);
}

/**
 * Parse markdown content string
 */
export function parseMarkdownContent(content: string): ParsedMarkdown {
  const headings: Heading[] = [];
  const codeBlocks: CodeBlock[] = [];
  const links: Link[] = [];

  // Extract headings
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
    });
  }

  // Extract code blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    codeBlocks.push({
      language: match[1] || undefined,
      code: match[2].trim(),
    });
  }

  // Extract links
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(content)) !== null) {
    links.push({
      text: match[1],
      href: match[2],
    });
  }

  // Get title (first h1 or first line)
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : content.split("\n")[0].trim();

  return {
    title,
    content,
    headings,
    codeBlocks,
    links,
  };
}

/**
 * Extract a section from markdown content by heading
 */
export function extractSection(
  content: string,
  headingText: string
): string | null {
  const lines = content.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      const headingLevel = headingMatch[1].length;
      const headingTextMatch = headingMatch[2].trim();

      if (headingTextMatch === headingText) {
        inSection = true;
        sectionLines.push(line);
        continue;
      }

      // Stop if we hit another heading at same or higher level
      if (inSection && headingLevel <= 2) {
        break;
      }
    }

    if (inSection) {
      sectionLines.push(line);
    }
  }

  return sectionLines.length > 0 ? sectionLines.join("\n") : null;
}

/**
 * Find all markdown files in a directory recursively
 */
import { readdirSync, statSync } from "fs";

export function findMarkdownFiles(dirPath: string): string[] {
  const files: string[] = [];

  function traverse(currentPath: string) {
    const entries = readdirSync(currentPath);

    for (const entry of entries) {
      const fullPath = join(currentPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (entry.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  traverse(dirPath);
  return files;
}

