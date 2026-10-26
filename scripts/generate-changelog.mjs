#!/usr/bin/env node
/**
 * Automated Changelog Generator & Extractor for @rundeck/mcp
 *
 * Generates and maintains CHANGELOG.md (Keep a Changelog format) from git
 * history starting at v1.0.0, with automatic categorization and Renovate
 * dependency-bump deduplication into a Markdown table.
 *
 * Also supports extracting or verifying an existing version section from the
 * committed CHANGELOG.md so that human-curated edits made in a Release PR are
 * preserved verbatim by CircleCI and GitHub Releases when tagging.
 *
 * Usage:
 *   node scripts/generate-changelog.mjs                        # Regenerate CHANGELOG.md (with [Unreleased] + releases >= v1.0.0)
 *   node scripts/generate-changelog.mjs --release <X.Y.Z>      # Stamp HEAD changes as release [X.Y.Z] in CHANGELOG.md (for Release PR)
 *   node scripts/generate-changelog.mjs --notes <X.Y.Z>        # Extract ## [X.Y.Z] notes from CHANGELOG.md (falls back to git generation)
 *   node scripts/generate-changelog.mjs --verify-tag <X.Y.Z>   # Verify CHANGELOG.md already has ## [X.Y.Z] (used in CI on tag push)
 *   node scripts/generate-changelog.mjs --check                # Dry-run validation for CI
 */

import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");
const DEFAULT_CHANGELOG_PATH = join(ROOT_DIR, "CHANGELOG.md");
const DEFAULT_REPO_URL = "https://github.com/rundeck/mcp";
const MIN_RELEASE_VERSION = "1.0.0";

const CATEGORY_ORDER = [
  "Added",
  "Changed",
  "Fixed",
  "Security",
  "Maintenance & CI",
];

/**
 * Parse a semver string ("v1.2.3" or "1.2.3") into numeric components.
 * Returns null if the string is not a strict X.Y.Z semver version.
 */
export function parseSemver(versionStr) {
  if (typeof versionStr !== "string") return null;
  const cleaned = versionStr.trim().replace(/^v/, "");
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(cleaned);
  if (!match) return null;
  return {
    raw: cleaned,
    tag: `v${cleaned}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Compare two semver strings in ascending order (-1, 0, 1).
 */
export function compareSemver(a, b) {
  const pa = typeof a === "object" && a !== null ? a : parseSemver(a);
  const pb = typeof b === "object" && b !== null ? b : parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

/**
 * Detect whether a commit/PR represents a Renovate or automated dependency update,
 * and extract the package name and target version if possible.
 */
export function parseDependencyUpdate({ branch = "", title = "" }) {
  const cleanTitle = title.replace(/^\[RUN-\d+\]\s*/i, "").trim();
  const isRenovateBranch = /(?:^|\/)renovate\//i.test(branch);

  // Pattern 1: "Update dependency <pkg> to <version>"
  const depMatch = /^Update dependency\s+(\S+)\s+to\s+(\S+)/i.exec(cleanTitle);
  if (depMatch) {
    return {
      packageName: depMatch[1],
      version: depMatch[2],
    };
  }

  // Pattern 2: "Update <name> monorepo (to <version>)?"
  const monorepoMatch = /^Update\s+(.+?\s+monorepo)(?:\s+to\s+(\S+))?$/i.exec(cleanTitle);
  if (monorepoMatch) {
    return {
      packageName: monorepoMatch[1].trim(),
      version: monorepoMatch[2] || null,
    };
  }

  // Pattern 3: "Update <image> Docker tag to <version>"
  const dockerTagMatch = /^Update\s+(.+?)\s+Docker tag\s+to\s+(\S+)/i.exec(cleanTitle);
  if (dockerTagMatch) {
    return {
      packageName: dockerTagMatch[1].trim(),
      version: dockerTagMatch[2],
    };
  }

  // Pattern 4: "Update <action> action to <version>"
  const actionMatch = /^Update\s+(\S+)\s+action\s+to\s+(\S+)/i.exec(cleanTitle);
  if (actionMatch) {
    return {
      packageName: actionMatch[1],
      version: actionMatch[2],
    };
  }

  // Pattern 5: Any other PR from a renovate/* branch
  if (isRenovateBranch) {
    return {
      packageName: cleanTitle,
      version: null,
    };
  }

  return null;
}

/**
 * Clean a raw PR/commit title for presentation:
 * - Removes placeholder `[RUN-0000]` prefix while preserving real Jira keys (`[RUN-5043]`)
 * - Removes conventional-commit prefixes (`feat:`, `fix:`, `ci:`, `chore:`, `docs:`)
 * - Capitalizes the first word after any `[RUN-XXXX]` prefix
 */
export function cleanEntryTitle(rawTitle) {
  let text = (rawTitle || "").trim();

  // Extract optional Jira ticket prefix
  let ticketPrefix = "";
  const ticketMatch = /^\[(RUN-\d+)\]\s*/i.exec(text);
  if (ticketMatch) {
    const ticket = ticketMatch[1].toUpperCase();
    if (ticket !== "RUN-0000") {
      ticketPrefix = `[${ticket}] `;
    }
    text = text.slice(ticketMatch[0].length).trim();
  }

  // Strip conventional commit prefix if present
  text = text.replace(/^(?:feat|fix|ci|chore|docs|refactor|test|build|perf)(?:\([^)]+\))?:\s*/i, "").trim();

  if (text.length > 0) {
    text = text[0].toUpperCase() + text.slice(1);
  }

  return `${ticketPrefix}${text}`.trim();
}

/**
 * Classify a non-Renovate commit/PR into a Keep a Changelog category.
 */
export function classifyEntry({ branch = "", title = "" }) {
  const noTicket = (title || "").replace(/^\[RUN-\d+\]\s*/i, "").trim();
  const lowerTitle = noTicket.toLowerCase();
  const lowerBranch = (branch || "").toLowerCase();

  // Security & supply-chain hardening
  if (
    /\bcve-\d+/i.test(noTicket) ||
    /\bsnyk\b/i.test(noTicket) ||
    /\bpin container images\b/i.test(noTicket) ||
    /\bpin all npm dependencies\b/i.test(noTicket) ||
    /\bsecurity\b/i.test(noTicket)
  ) {
    return "Security";
  }

  // Bug fixes
  if (
    /(?:^|\/)(?:fix|bugfix|hotfix)\//.test(lowerBranch) ||
    /^fix(?:\([^)]+\))?:/i.test(noTicket) ||
    /^(?:fix|resolve|carve|repair|correct)\b/i.test(noTicket)
  ) {
    return "Fixed";
  }

  // Maintenance & CI/CD / repo housekeeping
  if (
    /(?:^|\/)(?:ci|chore|docs)\//.test(lowerBranch) ||
    /^(?:ci|chore|docs|test|build)(?:\([^)]+\))?:/i.test(noTicket) ||
    /\b(?:github actions|github releases|circleci|renovate|quarantine|license|readme\.md|snyk workflow|pr template)\b/i.test(lowerTitle)
  ) {
    return "Maintenance & CI";
  }

  // New features / capabilities
  if (
    /(?:^|\/)(?:feat|feature)\//.test(lowerBranch) ||
    /^feat(?:\([^)]+\))?:/i.test(noTicket) ||
    /^(?:add|support|serve|introduce|implement|create)\b/i.test(noTicket)
  ) {
    return "Added";
  }

  // Default to Changed for enhancements, migrations, updates, removals
  return "Changed";
}

/**
 * Parse raw git log records (separated by \x1e, fields separated by \x1f)
 * into structured commit records.
 */
export function parseGitLogOutput(rawLog, resolveMergeHeadline) {
  if (!rawLog || !rawLog.trim()) return [];

  const records = rawLog
    .split("\x1e")
    .map((r) => r.trim())
    .filter(Boolean);

  const parsed = [];

  for (const record of records) {
    const [fullHash, shortHash, date, subject, body = ""] = record.split("\x1f");
    if (!fullHash || !subject) continue;

    const trimmedSubject = subject.trim();
    const firstBodyLine = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !/^Co-authored-by:/i.test(l));

    // Case 1: Standard GitHub PR merge commit
    const prMergeMatch = /^Merge pull request #(\d+) from ([^\s]+)$/i.exec(trimmedSubject);
    if (prMergeMatch) {
      const prNumber = Number(prMergeMatch[1]);
      const branch = prMergeMatch[2];
      // Skip Release PR merges (e.g. from rundeck/release/v1.0.1) so they don't appear in future changelogs
      if (/(?:^|\/)release\/v?\d+\.\d+\.\d+/i.test(branch)) {
        continue;
      }
      let title = firstBodyLine || "";
      if (!title && typeof resolveMergeHeadline === "function") {
        title = resolveMergeHeadline(fullHash) || "";
      }
      if (!title) {
        title = branch.split("/").slice(1).join("/") || trimmedSubject;
      }

      parsed.push({
        hash: fullHash,
        shortHash,
        date: (date || "").trim(),
        prNumber,
        branch,
        title,
      });
      continue;
    }

    // Case 2: Skip internal branch-sync merge commits and Release PR merge commits
    if (
      /^Merge (?:remote-tracking )?branch\b/i.test(trimmedSubject) ||
      /^Merge main into\b/i.test(trimmedSubject)
    ) {
      continue;
    }

    // Case 3: Squash-merged PR commit ("Some title (#123)")
    const squashMatch = /^(.+?)\s+\(#(\d+)\)$/.exec(trimmedSubject);
    if (squashMatch) {
      parsed.push({
        hash: fullHash,
        shortHash,
        date: (date || "").trim(),
        prNumber: Number(squashMatch[2]),
        branch: "",
        title: squashMatch[1].trim(),
      });
      continue;
    }

    // Case 4: Direct commit with explicit Jira ticket or conventional prefix
    if (/^\[RUN-\d+\]/i.test(trimmedSubject) || /^(?:feat|fix|ci|docs|security)(?:\([^)]+\))?:/i.test(trimmedSubject)) {
      parsed.push({
        hash: fullHash,
        shortHash,
        date: (date || "").trim(),
        prNumber: null,
        branch: "",
        title: trimmedSubject,
      });
    }
  }

  return parsed;
}

/**
 * Group parsed commits for a single release into categorized entries and
 * deduplicated dependency updates.
 */
export function buildReleaseData(commits) {
  const categories = new Map(CATEGORY_ORDER.map((c) => [c, []]));
  const seenPrs = new Set();
  const seenTitles = new Set();

  // Map from packageName (lowercase) -> { packageName, version, prNumber, shortHash }
  // Since git log is newest-first, the first entry we see for a package is the
  // latest version in this release window.
  const dependencyMap = new Map();

  for (const commit of commits) {
    if (commit.prNumber && seenPrs.has(commit.prNumber)) {
      continue;
    }
    if (commit.prNumber) {
      seenPrs.add(commit.prNumber);
    }

    const depUpdate = parseDependencyUpdate(commit);
    if (depUpdate) {
      const key = depUpdate.packageName.toLowerCase();
      if (!dependencyMap.has(key)) {
        dependencyMap.set(key, {
          packageName: depUpdate.packageName,
          version: depUpdate.version,
          prNumber: commit.prNumber,
          shortHash: commit.shortHash,
        });
      }
      continue;
    }

    const cleanedTitle = cleanEntryTitle(commit.title);
    if (!cleanedTitle) continue;

    // Skip changelog / release preparation self-commits
    if (
      /^update changelog(?:\.md)?(?:\s+for\s+\S+)?$/i.test(cleanedTitle) ||
      /^prepare release\s+v?\d+\.\d+\.\d+$/i.test(cleanedTitle) ||
      /^release\s+v?\d+\.\d+\.\d+$/i.test(cleanedTitle) ||
      /^chore\(release\):/i.test(cleanedTitle)
    ) {
      continue;
    }

    const dedupeKey = cleanedTitle.toLowerCase();
    if (seenTitles.has(dedupeKey)) {
      continue;
    }
    seenTitles.add(dedupeKey);

    const category = classifyEntry(commit);
    categories.get(category).push({
      title: cleanedTitle,
      prNumber: commit.prNumber,
      shortHash: commit.shortHash,
      hash: commit.hash,
    });
  }

  const dependencies = Array.from(dependencyMap.values()).sort((a, b) =>
    a.packageName.localeCompare(b.packageName)
  );

  return {
    categories,
    dependencies,
  };
}

/**
 * Format a single release section (without the top-level CHANGELOG header).
 */
export function formatReleaseSection({
  version,
  date,
  commits,
  repoUrl = DEFAULT_REPO_URL,
  releaseSummary = "",
}) {
  const { categories, dependencies } = buildReleaseData(commits);
  const hasCategories = Array.from(categories.values()).some((list) => list.length > 0);
  const hasDependencies = dependencies.length > 0;

  // An explicitly requested numbered release must remain visible even when
  // there are no recognizable commits (for example, a version-only rebuild).
  // Unreleased is omitted when empty to avoid a permanently blank section.
  if (version === "Unreleased" && !hasCategories && !hasDependencies && !releaseSummary) {
    return "";
  }

  const lines = [];
  const heading =
    version === "Unreleased"
      ? "## [Unreleased]"
      : `## [${version}] - ${date}`;
  lines.push(heading);
  lines.push("");

  if (releaseSummary) {
    lines.push(releaseSummary);
    lines.push("");
  }

  for (const category of CATEGORY_ORDER) {
    const items = categories.get(category) || [];
    if (items.length === 0) continue;

    lines.push(`### ${category}`);
    lines.push("");
    for (const item of items) {
      const refLink = item.prNumber
        ? `([#${item.prNumber}](${repoUrl}/pull/${item.prNumber}))`
        : item.shortHash
          ? `([${item.shortHash}](${repoUrl}/commit/${item.hash || item.shortHash}))`
          : "";
      lines.push(`- ${item.title}${refLink ? ` ${refLink}` : ""}`);
    }
    lines.push("");
  }

  if (hasDependencies) {
    lines.push("### Dependencies");
    lines.push("");
    lines.push("| Dependency | Updated to | PR |");
    lines.push("| :--- | :--- | :--- |");
    for (const dep of dependencies) {
      const verCell = dep.version ? `\`${dep.version}\`` : "latest";
      const prCell = dep.prNumber
        ? `[#${dep.prNumber}](${repoUrl}/pull/${dep.prNumber})`
        : "—";
      lines.push(`| \`${dep.packageName}\` | ${verCell} | ${prCell} |`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Extract an existing `## [<version>]` section directly from a CHANGELOG.md
 * string, preserving any manual edits made during a Release PR review.
 * Returns null if the section does not exist in the markdown.
 */
export function extractSectionFromChangelog(markdown, versionStr, { includeReferences = true } = {}) {
  if (!markdown || !versionStr) return null;
  const target =
    versionStr === "Unreleased"
      ? "Unreleased"
      : (parseSemver(versionStr)?.raw ?? versionStr.replace(/^v/, ""));

  const lines = markdown.split(/\r?\n/);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRegex = new RegExp(`^## \\[${escaped}\\](?:\\s+-\\s+\\S+)?\\s*$`);

  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (startIdx === -1) {
      if (startRegex.test(lines[i])) {
        startIdx = i;
      }
    } else if (/^## \[/.test(lines[i]) || /^\[[^\]]+\]:\s+https?:\/\//.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  if (startIdx === -1) return null;
  const section = lines.slice(startIdx, endIdx).join("\n").trim();
  if (!includeReferences) return section;

  const references = getCustomReferenceDefinitions(markdown)
    .filter(({ label }) => isReferenceUsed(section, label))
    .map(({ raw }) => raw);

  return references.length > 0 ? `${section}\n\n${references.join("\n")}` : section;
}

function isVersionReference(label) {
  return label === "Unreleased" || parseSemver(label) !== null;
}

function getCustomReferenceDefinitions(markdown) {
  if (!markdown) return [];

  return markdown
    .split(/\r?\n/)
    .map((raw) => {
      const match = /^\[([^\]]+)\]:\s+.+$/.exec(raw);
      return match && !isVersionReference(match[1]) ? { label: match[1], raw } : null;
    })
    .filter(Boolean);
}

function isReferenceUsed(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\[[^\\]]+\\]\\[${escaped}\\]|\\[${escaped}\\](?![(:])`, "i").test(markdown);
}

/**
 * Prefer already-committed historical release sections over generated ones.
 * Release PR reviewers can curate those sections; a later release must never
 * rewrite that reviewed history simply because it regenerates the document.
 */
function getRenderedSection(section, repoUrl, existingChangelog, releaseVersion) {
  if (
    existingChangelog &&
    section.version !== "Unreleased" &&
    section.version !== releaseVersion
  ) {
    // Full-document rendering keeps custom reference definitions in one shared
    // footer. Only standalone `--notes` extraction attaches them to its output.
    const existing = extractSectionFromChangelog(existingChangelog, section.version, {
      includeReferences: false,
    });
    if (existing) return existing;
  }

  return formatReleaseSection({ ...section, repoUrl });
}

/**
 * Assemble the complete CHANGELOG.md document from a list of release definitions.
 */
export function renderFullChangelog(
  sections,
  { repoUrl = DEFAULT_REPO_URL, existingChangelog = "", releaseVersion = null } = {}
) {
  const lines = [
    "# Changelog",
    "",
    "All notable changes to `@rundeck/mcp` are documented in this file.",
    "",
    "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),",
    "and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).",
    "",
  ];

  const renderedSections = sections
    .map((sec) => getRenderedSection(sec, repoUrl, existingChangelog, releaseVersion))
    .filter(Boolean);

  for (const block of renderedSections) {
    lines.push(block);
    lines.push("");
  }

  // Reference links footer
  const linkLines = [];
  const includedTags = new Set(
    sections.filter((s) => s.version !== "Unreleased" && s.toTag).map((s) => s.toTag)
  );
  for (const sec of sections) {
    if (!sec.fromTag && !sec.toTag) continue;
    if (sec.version === "Unreleased" && sec.fromTag) {
      linkLines.push(`[Unreleased]: ${repoUrl}/compare/${sec.fromTag}...HEAD`);
    } else if (
      sec.version !== "Unreleased" &&
      sec.fromTag &&
      sec.toTag &&
      includedTags.has(sec.fromTag)
    ) {
      linkLines.push(`[${sec.version}]: ${repoUrl}/compare/${sec.fromTag}...${sec.toTag}`);
    } else if (sec.version !== "Unreleased" && sec.toTag) {
      linkLines.push(`[${sec.version}]: ${repoUrl}/releases/tag/${sec.toTag}`);
    }
  }

  if (linkLines.length > 0) {
    lines.push(...linkLines);
  }

  // Changelog sections are allowed to use additional reference-style links.
  // Preserve these definitions whenever the generated document is refreshed.
  const customReferenceLines = getCustomReferenceDefinitions(existingChangelog).map(
    ({ raw }) => raw
  );
  if (customReferenceLines.length > 0) {
    lines.push(...customReferenceLines);
  }

  if (linkLines.length > 0 || customReferenceLines.length > 0) {
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Execute a git command in the repository directory.
 */
function runGit(args, cwd = ROOT_DIR) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Collect git tags and commit history to build the release sections list.
 */
export function collectRepoSections({
  cwd = ROOT_DIR,
  releaseVersion = null,
  releaseDate = new Date().toISOString().slice(0, 10),
  minVersion = MIN_RELEASE_VERSION,
  execGit = runGit,
} = {}) {
  const rawTagsOutput = execGit(
    [
      "for-each-ref",
      "--sort=creatordate",
      "--format=%(refname:short)|%(creatordate:short)",
      "refs/tags",
    ],
    cwd
  );

  const allSemverTags = [];
  for (const line of rawTagsOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [tagName, tagDate] = trimmed.split("|");
    const parsed = parseSemver(tagName);
    if (parsed) {
      allSemverTags.push({
        ...parsed,
        date: tagDate || releaseDate,
      });
    }
  }

  allSemverTags.sort((a, b) => compareSemver(a, b));

  const minParsed = parseSemver(minVersion);
  const resolveMergeHeadline = (hash) => {
    try {
      return execGit(["log", "-1", "--format=%s", `${hash}^2`], cwd).trim();
    } catch {
      return "";
    }
  };

  const getCommitsInRange = (fromRef, toRef) => {
    const rangeSpec = fromRef ? `${fromRef}..${toRef}` : toRef;
    const raw = execGit(
      [
        "log",
        "--first-parent",
        "--format=%H%x1f%h%x1f%ad%x1f%s%x1f%b%x1e",
        "--date=short",
        rangeSpec,
      ],
      cwd
    );
    return parseGitLogOutput(raw, resolveMergeHeadline);
  };

  const sections = [];
  const normalizedTarget = releaseVersion ? parseSemver(releaseVersion) : null;
  const targetTagExists =
    normalizedTarget && allSemverTags.some((t) => t.raw === normalizedTarget.raw);

  // Head section: either stamped as [releaseVersion] (when preparing a release PR
  // whose tag isn't already in allSemverTags) or [Unreleased].
  const latestTag = allSemverTags.length > 0 ? allSemverTags[allSemverTags.length - 1] : null;
  if (!targetTagExists) {
    const headCommits = getCommitsInRange(latestTag ? latestTag.tag : null, "HEAD");
    if (normalizedTarget) {
      sections.push({
        version: normalizedTarget.raw,
        date: releaseDate,
        commits: headCommits,
        fromTag: latestTag ? latestTag.tag : null,
        toTag: normalizedTarget.tag,
      });
    } else if (headCommits.length > 0) {
      sections.push({
        version: "Unreleased",
        date: releaseDate,
        commits: headCommits,
        fromTag: latestTag ? latestTag.tag : null,
        toTag: "HEAD",
      });
    }
  }

  // Historical tagged releases >= minVersion, newest first
  for (let i = allSemverTags.length - 1; i >= 0; i--) {
    const currentTag = allSemverTags[i];
    if (minParsed && compareSemver(currentTag, minParsed) < 0) {
      continue;
    }
    const prevTag = i > 0 ? allSemverTags[i - 1] : null;
    const commits = getCommitsInRange(prevTag ? prevTag.tag : null, currentTag.tag);
    const releaseSummary =
      currentTag.raw === "1.0.0"
        ? "First stable GA release of `@rundeck/mcp`, providing Rundeck documentation resources, API/job/runner/ACL/resource-model tools, and MCP protocol support over stdio."
        : "";

    sections.push({
      version: currentTag.raw,
      date: currentTag.date,
      commits,
      fromTag: prevTag ? prevTag.tag : null,
      toTag: currentTag.tag,
      releaseSummary,
    });
  }

  return sections;
}

/**
 * CLI entry point
 */
function main(argv = process.argv.slice(2)) {
  let releaseVersion = null;
  let notesVersion = null;
  let verifyTagVersion = null;
  let checkOnly = false;
  let outputPath = DEFAULT_CHANGELOG_PATH;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--release") {
      const next = argv[++i];
      const parsed = parseSemver(next);
      if (!parsed) {
        console.error(`[changelog] Invalid --release semver version: ${next}`);
        process.exit(1);
      }
      releaseVersion = parsed.raw;
    } else if (arg === "--notes") {
      const next = argv[++i];
      if (!next) {
        console.error("[changelog] Missing value for --notes (<X.Y.Z> or Unreleased)");
        process.exit(1);
      }
      notesVersion = next === "Unreleased" ? "Unreleased" : (parseSemver(next)?.raw ?? null);
      if (!notesVersion) {
        console.error(`[changelog] Invalid --notes version: ${next}`);
        process.exit(1);
      }
    } else if (arg === "--verify-tag") {
      const next = argv[++i];
      const parsed = parseSemver(next);
      if (!parsed) {
        console.error(`[changelog] Invalid --verify-tag semver version: ${next}`);
        process.exit(1);
      }
      verifyTagVersion = parsed.raw;
    } else if (arg === "--output") {
      outputPath = argv[++i];
      if (!outputPath) {
        console.error("[changelog] Missing value for --output");
        process.exit(1);
      }
    } else if (arg === "--check") {
      checkOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/generate-changelog.mjs [--release <X.Y.Z>] [--notes <X.Y.Z|Unreleased>] [--verify-tag <X.Y.Z>] [--check] [--output <path>]"
      );
      process.exit(0);
    } else {
      console.error(`[changelog] Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  // --verify-tag <X.Y.Z>: release publication is allowed only when the
  // versioned section was committed in the reviewed Release PR. This command
  // deliberately never mutates CHANGELOG.md: generating notes after merge
  // would bypass that review gate.
  if (verifyTagVersion) {
    if (existsSync(outputPath)) {
      const existing = readFileSync(outputPath, "utf-8");
      const section = extractSectionFromChangelog(existing, verifyTagVersion);
      if (section) {
        console.log(
          `[changelog] Verified CHANGELOG.md contains committed section for [${verifyTagVersion}].`
        );
        return;
      }
    }
    console.error(
      `[changelog] CHANGELOG.md must contain a committed ## [${verifyTagVersion}] section before publishing this tag.`
    );
    process.exit(1);
  }

  // --notes <X.Y.Z>: prefer extracting the section from the committed CHANGELOG.md
  // (so any edits reviewed in the Release PR are preserved on the GitHub Release page);
  // fall back to generating from git history if not found in the file.
  if (notesVersion) {
    if (!releaseVersion && existsSync(outputPath)) {
      const existing = readFileSync(outputPath, "utf-8");
      const extracted = extractSectionFromChangelog(existing, notesVersion);
      if (extracted) {
        process.stdout.write(`${extracted}\n`);
        return;
      }
    }
    const effectiveRelease = notesVersion !== "Unreleased" ? notesVersion : null;
    const sections = collectRepoSections({ releaseVersion: effectiveRelease });
    const targetSection = sections.find((s) => s.version === notesVersion);
    if (!targetSection) {
      console.error(`[changelog] Version section '${notesVersion}' not found in CHANGELOG.md or git history.`);
      process.exit(1);
    }
    const rendered = formatReleaseSection(targetSection);
    process.stdout.write(`${rendered}\n`);
    return;
  }

  const sections = collectRepoSections({ releaseVersion });
  // Both release preparation and the normal `npm run changelog` maintenance
  // command preserve reviewed historical release sections. Regeneration only
  // refreshes Unreleased (and the explicitly requested release section).
  const existingChangelog = existsSync(outputPath) ? readFileSync(outputPath, "utf-8") : "";
  const fullMarkdown = renderFullChangelog(sections, {
    existingChangelog,
    releaseVersion,
  });

  if (checkOnly) {
    if (!fullMarkdown.includes("## [1.0.0]")) {
      console.error("[changelog] Validation failed: expected ## [1.0.0] section in generated changelog.");
      process.exit(1);
    }
    console.log(`[changelog] Validation passed (${sections.length} section(s) generated cleanly).`);
    return;
  }

  writeFileSync(outputPath, fullMarkdown, "utf-8");
  console.log(`[changelog] Wrote ${outputPath} (${sections.length} section(s)).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
