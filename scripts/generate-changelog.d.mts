export interface ParsedSemver {
  raw: string;
  tag: string;
  major: number;
  minor: number;
  patch: number;
}

export interface DependencyUpdate {
  packageName: string;
  version: string | null;
}

export interface ChangelogCommit {
  hash: string;
  shortHash: string;
  date: string;
  prNumber: number | null;
  branch: string;
  title: string;
}

export interface CategorizedItem {
  title: string;
  prNumber: number | null;
  shortHash: string;
  hash: string;
}

export interface DeduplicatedDependency {
  packageName: string;
  version: string | null;
  prNumber: number | null;
  shortHash: string;
}

export interface ReleaseData {
  categories: Map<string, CategorizedItem[]>;
  dependencies: DeduplicatedDependency[];
}

export interface ReleaseSectionInput {
  version: string;
  date: string;
  commits: ChangelogCommit[];
  repoUrl?: string;
  releaseSummary?: string;
  fromTag?: string | null;
  toTag?: string | null;
}

export function parseSemver(versionStr: string): ParsedSemver | null;
export function compareSemver(
  a: string | ParsedSemver,
  b: string | ParsedSemver
): number;
export function parseDependencyUpdate(input: {
  branch?: string;
  title?: string;
}): DependencyUpdate | null;
export function cleanEntryTitle(rawTitle: string): string;
export function classifyEntry(input: {
  branch?: string;
  title?: string;
}): string;
export function parseGitLogOutput(
  rawLog: string,
  resolveMergeHeadline?: (hash: string) => string
): ChangelogCommit[];
export function buildReleaseData(commits: ChangelogCommit[]): ReleaseData;
export function formatReleaseSection(input: ReleaseSectionInput): string;
export function extractSectionFromChangelog(
  markdown: string,
  versionStr: string,
  options?: { includeReferences?: boolean }
): string | null;
export function renderFullChangelog(
  sections: ReleaseSectionInput[],
  options?: {
    repoUrl?: string;
    existingChangelog?: string;
    releaseVersion?: string | null;
  }
): string;
export function collectRepoSections(options?: {
  cwd?: string;
  releaseVersion?: string | null;
  releaseDate?: string;
  minVersion?: string;
  execGit?: (args: string[], cwd?: string) => string;
}): ReleaseSectionInput[];
