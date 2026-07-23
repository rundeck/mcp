import {
  TOOL_RELATIONSHIPS,
  renderPriorityGuidance,
  renderFallbackGuidance,
} from "../../tools/tool-relationships.js";
import { REGISTERED_TOOL_NAMES } from "../../tools/registered-tool-names.js";

describe("TOOL_RELATIONSHIPS", () => {
  it("covers exactly the expected specialized tools", () => {
    expect(TOOL_RELATIONSHIPS.map((r) => r.tool).sort()).toEqual(
      ["acl_manage", "job_create", "job_validate", "runner_create"].sort()
    );
  });

  it("every referenced tool name exists in REGISTERED_TOOL_NAMES", () => {
    for (const relationship of TOOL_RELATIONSHIPS) {
      expect(REGISTERED_TOOL_NAMES).toContain(relationship.tool);
      expect(REGISTERED_TOOL_NAMES).toContain(relationship.prioritizedOver);
      expect(REGISTERED_TOOL_NAMES).toContain(relationship.fallbackTo);
    }
  });
});

describe("renderPriorityGuidance", () => {
  it.each(["runner_create", "acl_manage", "job_create", "job_validate"])(
    "mentions api_call for %s's own priority text",
    (toolName) => {
      const guidance = renderPriorityGuidance(toolName);
      expect(guidance).toContain("api_call");
      expect(guidance).toContain("Prioritized over");
    }
  );

  it("returns the deferral bullet list for api_call, covering all four specialized tools", () => {
    const guidance = renderPriorityGuidance("api_call");
    expect(guidance).toContain("runner_create");
    expect(guidance).toContain("acl_manage");
    expect(guidance).toContain("job_create");
    expect(guidance).toContain("job_validate");
  });

  it("returns an empty string for a tool with no relationship", () => {
    expect(renderPriorityGuidance("docs_search")).toBe("");
  });
});

describe("renderFallbackGuidance", () => {
  it.each(["runner_create", "acl_manage", "job_create", "job_validate"])(
    "returns a Fallback section mentioning api_call for %s",
    (toolName) => {
      const guidance = renderFallbackGuidance(toolName);
      expect(guidance).toContain("## Fallback");
      expect(guidance).toContain("api_call");
    }
  );

  it("returns an empty string for a tool with no relationship", () => {
    expect(renderFallbackGuidance("docs_search")).toBe("");
  });
});
