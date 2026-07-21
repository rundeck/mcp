/**
 * Tests for PR #45: arbitrary-depth path resolution under
 * rundeck://docs/manual/* and rundeck://docs/administration/*, plus
 * dynamic discovery of nested directories in listResources().
 *
 * These run against the real downloaded Rundeck docs (postinstall downloads
 * them to docs/docs — see scripts/download-docs.mjs) so the nested cases
 * match what docs_search actually finds, rather than a synthetic fixture.
 * manual/projects/node-execution and administration/cluster/logstore are the
 * exact two-levels-deep examples called out in the PR description.
 */

import { existsSync } from "fs";
import { join } from "path";
import { handleResource, listResources } from "../../resources/index.js";
import { getManualPath } from "../../resources/manual.js";
import { getAdministrationPath } from "../../resources/administration.js";
import { configManager } from "../../config.js";

const docsPath = configManager.getConfig().docsPath;
const hasManualNodeExecution = existsSync(
  join(docsPath, "manual", "projects", "node-execution", "ssh.md")
);
const hasAdminClusterLogstore = existsSync(
  join(docsPath, "administration", "cluster", "logstore", "azure.md")
);

(hasManualNodeExecution ? describe : describe.skip)(
  "Nested manual doc path resolution against real docs (PR #45)",
  () => {
    beforeEach(() => {
      configManager.initialize();
    });

    it("getManualPath resolves the single nested file manual/projects/node-execution/ssh.md", () => {
      const result = getManualPath(["projects", "node-execution", "ssh"]);
      expect(result).toContain("SSH Node Execution");
    });

    it("getManualPath resolves manual/projects/node-execution as a directory grouping all its files", () => {
      const result = getManualPath(["projects", "node-execution"]);
      expect(result).toContain("## ssh.md");
      expect(result).toContain("## aws-ssm.md");
      expect(result).toContain("## openssh.md");
    });

    it("handleResource resolves rundeck://docs/manual/projects/node-execution/ssh", () => {
      const result = handleResource("rundeck://docs/manual/projects/node-execution/ssh");
      expect(result).toContain("SSH Node Execution");
    });

    it("handleResource resolves rundeck://docs/manual/projects/node-execution as a directory", () => {
      const result = handleResource("rundeck://docs/manual/projects/node-execution");
      expect(result).toContain("## ssh.md");
      expect(result).toContain("## aws-ssm.md");
    });

    it("handleResource still resolves the pre-existing aws-ssm special case via the generic resolver", () => {
      // The PR removed the hardcoded "projects/node-execution/aws-ssm" special
      // case in index.ts because getManualPath reaches it generically now.
      const result = handleResource("rundeck://docs/manual/projects/node-execution/aws-ssm");
      expect(result.toLowerCase()).toContain("ssm");
    });

    it("getManualPath returns a not-found message for a path that doesn't exist", () => {
      const result = getManualPath(["projects", "node-execution", "does-not-really-exist"]);
      expect(result).toContain("not found");
    });

    it("listResources includes the dynamically discovered manual/projects/node-execution directory", () => {
      const uris = listResources().map((r) => r.uri);
      expect(uris).toContain("rundeck://docs/manual/projects/node-execution");
      expect(uris).toContain("rundeck://docs/manual/projects");
    });

    it("reported incident: rundeck://docs/manual/projects/node-execution/ssh is both listed and readable end-to-end", () => {
      const uris = listResources().map((r) => r.uri);
      expect(uris).toContain("rundeck://docs/manual/projects/node-execution/ssh");

      const result = handleResource("rundeck://docs/manual/projects/node-execution/ssh");
      expect(result).toContain("SSH Node Execution");
    });

    it("regression: resolves the pre-existing 2-segment shortcut rundeck://docs/manual/projects/aws-ssm", () => {
      // Before this PR, index.ts hardcoded `projects/aws-ssm` -> getAwsSsmSetup(),
      // which reads manual/projects/node-execution/aws-ssm.md directly. The
      // generic getManualPath resolver can't reach that file from this shorter
      // 2-segment URI (there's no manual/projects/aws-ssm.md), so without the
      // restored special case in index.ts this previously-working URI 404s.
      const result = handleResource("rundeck://docs/manual/projects/aws-ssm");
      expect(result.toLowerCase()).toContain("ssm");
      expect(result).not.toContain("not found");
    });

    it("regression: falls back to the manual root when a 2-segment topic file lives there instead of under its section", () => {
      // getManualTopic (pre-PR) tried `manual/{section}/{topic}.md`, then fell
      // back to `manual/{topic}.md` at the root. getManualPath must preserve
      // this for exactly the 2-segment case, or previously-working URIs like
      // this one (03-getting-started.md lives at manual root, not under jobs/)
      // silently 404 after the PR.
      const result = getManualPath(["jobs", "03-getting-started"]);
      expect(result).not.toContain("not found");
      expect(result.length).toBeGreaterThan(0);
    });
  }
);

(hasAdminClusterLogstore ? describe : describe.skip)(
  "Nested administration doc path resolution against real docs (PR #45)",
  () => {
    beforeEach(() => {
      configManager.initialize();
    });

    it("getAdministrationPath resolves the single nested file administration/cluster/logstore/azure.md", () => {
      const result = getAdministrationPath(["cluster", "logstore", "azure"]);
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("getAdministrationPath resolves administration/cluster/logstore as a directory grouping its files", () => {
      const result = getAdministrationPath(["cluster", "logstore"]);
      expect(result).toContain("## azure.md");
      expect(result).toContain("## s3.md");
    });

    it("handleResource resolves rundeck://docs/administration/cluster/logstore/azure", () => {
      const result = handleResource("rundeck://docs/administration/cluster/logstore/azure");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("handleResource resolves rundeck://docs/administration/cluster/logstore as a directory", () => {
      const result = handleResource("rundeck://docs/administration/cluster/logstore");
      expect(result).toContain("## azure.md");
      expect(result).toContain("## s3.md");
    });

    it("getAdministrationPath returns a not-found message for a path that doesn't exist", () => {
      const result = getAdministrationPath(["cluster", "logstore", "does-not-really-exist"]);
      expect(result).toContain("not found");
    });

    it("listResources includes the dynamically discovered administration/cluster/logstore directory", () => {
      const uris = listResources().map((r) => r.uri);
      expect(uris).toContain("rundeck://docs/administration/cluster/logstore");
      expect(uris).toContain("rundeck://docs/administration/cluster");
    });

    it("regression: falls back to the administration root when a 2-segment topic file lives there instead of under its category", () => {
      // getAdministrationTopic (pre-PR) tried `administration/{category}/{topic}.md`,
      // then fell back to `administration/{topic}.md` at the root (e.g.
      // license.md, which lives at the administration root, not under any
      // category). getAdministrationPath must preserve this for the
      // 2-segment case or this previously-working URI silently 404s.
      const result = getAdministrationPath(["install", "license"]);
      expect(result).not.toContain("not found");
      expect(result.length).toBeGreaterThan(0);
    });
  }
);

describe("Path traversal guard in getManualPath/getAdministrationPath", () => {
  beforeEach(() => {
    configManager.initialize();
  });

  it("getManualPath rejects '..' segments that would escape the manual base directory", () => {
    const result = getManualPath(["..", "..", "..", "..", "..", "etc", "passwd"]);
    expect(result).toContain("not found");
  });

  it("getAdministrationPath rejects '..' segments that would escape the administration base directory", () => {
    const result = getAdministrationPath(["..", "..", "..", "..", "..", "etc", "passwd"]);
    expect(result).toContain("not found");
  });

  it("handleResource normalizes dot-segments in the URI before routing (URL parsing collapses '..', so this is not a traversal exploit)", () => {
    // `new URL(...)` normalizes "/docs/manual/../administration" down to
    // "/docs/administration" before the handler ever sees a ".." segment, so
    // this legitimately routes to the administration index rather than
    // escaping the docs root. The real traversal guard is exercised directly
    // above, where literal ".." segments reach the resolver.
    const result = handleResource("rundeck://docs/manual/../administration");
    const directAdminIndexResult = handleResource("rundeck://docs/administration");
    expect(result).toBe(directAdminIndexResult);
  });
});

describe("listResources general integrity (PR #45)", () => {
  it("produces no duplicate URIs when dynamic discovery overlaps with static entries", () => {
    const uris = listResources().map((r) => r.uri);
    expect(uris.length).toBe(new Set(uris).size);
  });
});
