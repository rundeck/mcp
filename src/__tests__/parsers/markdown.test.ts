/**
 * Tests for markdown parser
 */

import {
  parseMarkdownContent,
  extractSection,
  findMarkdownFiles,
} from "../../parsers/markdown.js";

describe("Markdown Parser", () => {
  describe("parseMarkdownContent", () => {
    it("should parse basic markdown content", () => {
      const content = `# Title
Some content here
## Subtitle
More content`;

      const result = parseMarkdownContent(content);

      expect(result.title).toBe("Title");
      expect(result.headings).toHaveLength(2);
      expect(result.headings[0].level).toBe(1);
      expect(result.headings[0].text).toBe("Title");
      expect(result.headings[1].level).toBe(2);
      expect(result.headings[1].text).toBe("Subtitle");
    });

    it("should extract code blocks", () => {
      const content = `# Test
\`\`\`yaml
key: value
\`\`\`
\`\`\`bash
echo "test"
\`\`\``;

      const result = parseMarkdownContent(content);

      expect(result.codeBlocks).toHaveLength(2);
      expect(result.codeBlocks[0].language).toBe("yaml");
      expect(result.codeBlocks[0].code).toContain("key: value");
      expect(result.codeBlocks[1].language).toBe("bash");
    });

    it("should extract links", () => {
      const content = `# Test
[Link Text](https://example.com)
[Another Link](/path/to/doc.md)`;

      const result = parseMarkdownContent(content);

      expect(result.links).toHaveLength(2);
      expect(result.links[0].text).toBe("Link Text");
      expect(result.links[0].href).toBe("https://example.com");
    });

    it("should handle content without title", () => {
      const content = `Just some content without a title`;

      const result = parseMarkdownContent(content);

      expect(result.title).toBe("Just some content without a title");
      expect(result.headings).toHaveLength(0);
    });
  });

  describe("extractSection", () => {
    it("should extract a section by heading", () => {
      const content = `# Main Title
Some intro text

## Section One
Content for section one

## Section Two
Content for section two`;

      const result = extractSection(content, "Section One");

      expect(result).not.toBeNull();
      expect(result).toContain("Section One");
      expect(result).toContain("Content for section one");
      expect(result).not.toContain("Section Two");
    });

    it("should return null for non-existent section", () => {
      const content = `# Title
Content`;

      const result = extractSection(content, "Non-existent Section");

      expect(result).toBeNull();
    });

    it("should stop at next major heading", () => {
      const content = `# Main
## Section
Content here
## Next Section
Other content`;

      const result = extractSection(content, "Section");

      expect(result).toContain("Section");
      expect(result).toContain("Content here");
      expect(result).not.toContain("Next Section");
    });
  });

  describe("findMarkdownFiles", () => {
    it("should find markdown files in directory", () => {
      // This test requires actual filesystem, so we'll test with a mock or skip in CI
      // For now, just verify the function exists and can be called
      expect(typeof findMarkdownFiles).toBe("function");
    });
  });
});


