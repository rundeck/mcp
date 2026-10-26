/**
 * Unit tests for automated changelog generation (scripts/generate-changelog.mjs)
 */

import { readFileSync } from "fs";
import { join } from "path";
import * as yaml from "yaml";
import {
  parseSemver,
  compareSemver,
  parseDependencyUpdate,
  cleanEntryTitle,
  classifyEntry,
  parseGitLogOutput,
  buildReleaseData,
  formatReleaseSection,
  extractSectionFromChangelog,
  renderFullChangelog,
  collectRepoSections,
} from "../../../scripts/generate-changelog.mjs";

describe("Changelog generator", () => {
  describe("parseSemver & compareSemver", () => {
    it("parses valid semver strings with or without a leading 'v'", () => {
      expect(parseSemver("v1.0.0")).toEqual({
        raw: "1.0.0",
        tag: "v1.0.0",
        major: 1,
        minor: 0,
        patch: 0,
      });
      expect(parseSemver("2.14.5")).toEqual({
        raw: "2.14.5",
        tag: "v2.14.5",
        major: 2,
        minor: 14,
        patch: 5,
      });
    });

    it("returns null for non-semver tags", () => {
      expect(parseSemver("push")).toBeNull();
      expect(parseSemver("v1.0")).toBeNull();
      expect(parseSemver("SNAPSHOT")).toBeNull();
    });

    it("sorts semver versions in ascending order", () => {
      const versions = ["v1.2.0", "v0.0.5", "v1.0.0", "v1.10.0", "v1.2.1"];
      const sorted = versions.sort(compareSemver);
      expect(sorted).toEqual(["v0.0.5", "v1.0.0", "v1.2.0", "v1.2.1", "v1.10.0"]);
    });
  });

  describe("parseDependencyUpdate", () => {
    it("detects standard Renovate dependency updates", () => {
      expect(
        parseDependencyUpdate({
          branch: "rundeck/renovate/fast-uri-4.x",
          title: "[RUN-0000] Update dependency fast-uri to v4.2.2",
        })
      ).toEqual({
        packageName: "fast-uri",
        version: "v4.2.2",
      });
    });

    it("detects Renovate monorepo updates", () => {
      expect(
        parseDependencyUpdate({
          branch: "rundeck/renovate/jest-monorepo",
          title: "[RUN-0000] Update jest monorepo",
        })
      ).toEqual({
        packageName: "jest monorepo",
        version: null,
      });
    });

    it("detects GitHub Action updates", () => {
      expect(
        parseDependencyUpdate({
          branch: "rundeck/renovate/actions-checkout-7.x",
          title: "Update actions/checkout action to v7",
        })
      ).toEqual({
        packageName: "actions/checkout",
        version: "v7",
      });
    });

    it("returns null for normal feature/fix PRs", () => {
      expect(
        parseDependencyUpdate({
          branch: "rundeck/feature/RUN-5043-pin-digests",
          title: "[RUN-5043] Pin container images and GitHub Actions by digest",
        })
      ).toBeNull();
    });
  });

  describe("cleanEntryTitle", () => {
    it("strips placeholder [RUN-0000] prefix but preserves real Jira keys", () => {
      expect(cleanEntryTitle("[RUN-0000] Add Apache-2.0 LICENSE file")).toBe(
        "Add Apache-2.0 LICENSE file"
      );
      expect(
        cleanEntryTitle("[RUN-5043] Pin container images and GitHub Actions by digest")
      ).toBe("[RUN-5043] Pin container images and GitHub Actions by digest");
    });

    it("strips conventional commit prefixes and capitalizes the description", () => {
      expect(cleanEntryTitle("feat: add ACL policy validation")).toBe(
        "Add ACL policy validation"
      );
      expect(cleanEntryTitle("[RUN-4800] fix(api): handle empty body")).toBe(
        "[RUN-4800] Handle empty body"
      );
    });
  });

  describe("classifyEntry", () => {
    it("classifies security, fix, added, maintenance, and changed entries", () => {
      expect(
        classifyEntry({
          branch: "rundeck/feature/RUN-5043-pin-digests",
          title: "[RUN-5043] Pin container images and GitHub Actions by digest",
        })
      ).toBe("Security");

      expect(
        classifyEntry({
          branch: "rundeck/fix/acl-resource-discovery",
          title: "Fix ACL doc discoverability and nested resource routing",
        })
      ).toBe("Fixed");

      expect(
        classifyEntry({
          branch: "rundeck/feature/resource-model-source-manage",
          title: "[RUN-4796] Add resource_model_source_manage MCP tool",
        })
      ).toBe("Added");

      expect(
        classifyEntry({
          branch: "rundeck/run-0000-license",
          title: "[RUN-0000] Add Apache-2.0 LICENSE file",
        })
      ).toBe("Maintenance & CI");

      expect(
        classifyEntry({
          branch: "rundeck/env-file-support",
          title: "[RUN-5039] Bake release version into Docker User-Agent",
        })
      ).toBe("Changed");
    });
  });

  describe("parseGitLogOutput & deduplicated release formatting", () => {
    it("deduplicates multiple Renovate bumps of the same package to the latest version", () => {
      const sampleRawLog = [
        "1111111\x1f1111111\x1f2026-10-19\x1fMerge pull request #117 from rundeck/renovate/fast-uri-4.x\x1f[RUN-0000] Update dependency fast-uri to v4.2.2",
        "2222222\x1f2222222\x1f2026-10-15\x1fMerge pull request #96 from rundeck/renovate/fast-uri-4.x\x1f[RUN-0000] Update dependency fast-uri to v4.1.3",
        "3333333\x1f3333333\x1f2026-10-19\x1fMerge pull request #113 from rundeck/feature/RUN-5043-pin-digests\x1f[RUN-5043] Pin container images and GitHub Actions by digest",
        "4444444\x1f4444444\x1f2026-10-19\x1fMerge main into dependency update\x1fCo-authored-by: dev",
      ].join("\x1e");

      const commits = parseGitLogOutput(sampleRawLog);
      expect(commits).toHaveLength(3);

      const { categories, dependencies } = buildReleaseData(commits);
      expect(categories.get("Security")).toHaveLength(1);
      expect(dependencies).toEqual([
        {
          packageName: "fast-uri",
          version: "v4.2.2",
          prNumber: 117,
          shortHash: "1111111",
        },
      ]);

      const sectionMd = formatReleaseSection({
        version: "1.1.0",
        date: "2026-10-26",
        commits,
      });

      expect(sectionMd).toContain("## [1.1.0] - 2026-10-26");
      expect(sectionMd).toContain(
        "- [RUN-5043] Pin container images and GitHub Actions by digest ([#113](https://github.com/rundeck/mcp/pull/113))"
      );
      expect(sectionMd).toContain("| Dependency | Updated to | PR |");
      expect(sectionMd).toContain(
        "| `fast-uri` | `v4.2.2` | [#117](https://github.com/rundeck/mcp/pull/117) |"
      );
      expect(sectionMd).not.toContain("v4.1.3");
    });

    it("renders full changelog with compare links for subsequent versions and tag link for earliest version", () => {
      const full = renderFullChangelog([
        {
          version: "Unreleased",
          date: "2026-10-26",
          fromTag: "v1.0.0",
          toTag: "HEAD",
          commits: [
            {
              hash: "aaa",
              shortHash: "aaa",
              date: "2026-10-26",
              prNumber: 105,
              branch: "rundeck/env-file-support",
              title: "[RUN-5039] Bake release version into Docker User-Agent",
            },
          ],
        },
        {
          version: "1.0.0",
          date: "2026-08-26",
          fromTag: "v0.0.5",
          toTag: "v1.0.0",
          releaseSummary: "Initial 1.0 release.",
          commits: [],
        },
      ]);

      expect(full).toContain("# Changelog");
      expect(full).toContain("## [Unreleased]");
      expect(full).toContain("## [1.0.0] - 2026-08-26");
      expect(full).toContain("[Unreleased]: https://github.com/rundeck/mcp/compare/v1.0.0...HEAD");
      expect(full).toContain("[1.0.0]: https://github.com/rundeck/mcp/releases/tag/v1.0.0");

      const extracted100 = extractSectionFromChangelog(full, "v1.0.0");
      expect(extracted100).toBe(
        "## [1.0.0] - 2026-08-26\n\nInitial 1.0 release."
      );
      expect(extractSectionFromChangelog(full, "9.9.9")).toBeNull();
    });

    it("simulates the full PR-first release lifecycle (Release PR -> Merge -> Tag -> Future Release)", () => {
      let currentTags = "v0.0.5|2026-08-20\nv1.0.0|2026-08-26\n";
      const logByRange: Record<string, string> = {
        "v0.0.5..v1.0.0":
          "0000001\x1f0000001\x1f2026-08-26\x1fMerge pull request #94 from rundeck/remove-alpha\x1fUpdate README.md\x1e",
        "v1.0.0..HEAD": [
          "1111111\x1f1111111\x1f2026-10-19\x1fMerge pull request #117 from rundeck/renovate/fast-uri-4.x\x1f[RUN-0000] Update dependency fast-uri to v4.2.2",
          "2222222\x1f2222222\x1f2026-10-19\x1fMerge pull request #113 from rundeck/feature/RUN-5043-pin-digests\x1f[RUN-5043] Pin container images and GitHub Actions by digest",
          "3333333\x1f3333333\x1f2026-10-15\x1fMerge pull request #96 from rundeck/renovate/fast-uri-4.x\x1f[RUN-0000] Update dependency fast-uri to v4.1.3",
        ].join("\x1e"),
      };

      const fakeGit = (args: string[]) => {
        if (args[0] === "for-each-ref") return currentTags;
        if (args[0] === "log") {
          const range = args[args.length - 1];
          return logByRange[range] || "";
        }
        return "";
      };

      // Step 1 (Release PR): generate CHANGELOG.md for 1.0.1 before tag v1.0.1 exists
      const prSections = collectRepoSections({
        releaseVersion: "1.0.1",
        releaseDate: "2026-10-26",
        execGit: fakeGit,
      });
      const changelogMd = renderFullChangelog(prSections);

      // Simulate human curator adding a custom release highlight in the PR before merging
      const curatedChangelog = changelogMd.replace(
        "## [1.0.1] - 2026-10-26\n",
        "## [1.0.1] - 2026-10-26\n\nPatch release hardening container digests.\n"
      );

      // Step 2 (Tag main) & Step 3 (GitHub Actions + CircleCI):
      // Verify and extract notes from the committed CHANGELOG.md on main
      const extractedNotes = extractSectionFromChangelog(curatedChangelog, "1.0.1");
      expect(extractedNotes).toContain("## [1.0.1] - 2026-10-26");
      expect(extractedNotes).toContain("Patch release hardening container digests.");
      expect(extractedNotes).toContain("[RUN-5043] Pin container images and GitHub Actions by digest");
      expect(extractedNotes).toContain(
        "| `fast-uri` | `v4.2.2` | [#117](https://github.com/rundeck/mcp/pull/117) |"
      );
      expect(extractedNotes).not.toContain("v4.1.3");

      // Step 4 (Future release 1.0.2): v1.0.1 is now tagged; ensure the Release PR merge
      // commit (#120 from rundeck/release/v1.0.1) is skipped and not listed as a change
      currentTags += "v1.0.1|2026-10-26\n";
      logByRange["v1.0.0..v1.0.1"] = logByRange["v1.0.0..HEAD"];
      logByRange["v1.0.1..HEAD"] = [
        "5555555\x1f5555555\x1f2026-11-01\x1fMerge pull request #125 from rundeck/fix/timeout-edge-case\x1f[RUN-5099] Fix timeout edge case",
        "4444444\x1f4444444\x1f2026-10-26\x1fMerge pull request #120 from rundeck/release/v1.0.1\x1f[RUN-0000] Release v1.0.1",
      ].join("\x1e");

      const nextSections = collectRepoSections({
        releaseVersion: "1.0.2",
        releaseDate: "2026-11-01",
        execGit: fakeGit,
      });
      const nextSectionMd = formatReleaseSection(nextSections[0]);
      expect(nextSectionMd).toContain("[RUN-5099] Fix timeout edge case");
      expect(nextSectionMd).not.toContain("Release v1.0.1");
      expect(nextSectionMd).not.toContain("#120");
    });

    it("validates the CI workflow YAML files", () => {
      const releaseYml = yaml.parse(
        readFileSync(join(process.cwd(), ".github/workflows/release.yml"), "utf-8")
      );
      expect(releaseYml.on.pull_request.types).toContain("closed");
      expect(releaseYml.on.pull_request.branches).toContain("main");
      expect(releaseYml.on.push.tags).toContain("v[0-9]+.[0-9]+.[0-9]+");

      const circleConfig = yaml.parse(
        readFileSync(join(process.cwd(), ".circleci/config.yml"), "utf-8")
      );
      expect(circleConfig.jobs.build).toBeDefined();
      expect(circleConfig.jobs["npm-publish"]).toBeDefined();
    });
  });
});
