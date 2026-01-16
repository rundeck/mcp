/**
 * Job definition documentation resources
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { configManager } from "../config.js";

function getDocsPath(): string {
  return configManager.getConfig().docsPath;
}

/**
 * Get YAML job schema documentation
 */
export function getYamlJobSchema(): string {
  const yamlPath = join(
    getDocsPath(),
    "manual",
    "document-format-reference",
    "job-yaml-v12.md"
  );
  if (existsSync(yamlPath)) {
    return readFileSync(yamlPath, "utf-8");
  }
  throw new Error(`YAML job schema not found at ${yamlPath}`);
}

/**
 * Get JSON job schema documentation
 */
export function getJsonJobSchema(): string {
  const jsonPath = join(
    getDocsPath(),
    "manual",
    "document-format-reference",
    "job-json-v44.md"
  );
  if (existsSync(jsonPath)) {
    return readFileSync(jsonPath, "utf-8");
  }
  throw new Error(`JSON job schema not found at ${jsonPath}`);
}

/**
 * Get XML job schema documentation (legacy)
 */
export function getXmlJobSchema(): string {
  const xmlPath = join(
    getDocsPath(),
    "manual",
    "document-format-reference",
    "job-v20.md"
  );
  if (existsSync(xmlPath)) {
    return readFileSync(xmlPath, "utf-8");
  }
  throw new Error(`XML job schema not found at ${xmlPath}`);
}

/**
 * Get job workflows documentation
 */
export function getJobWorkflows(): string {
  const workflowsPath = join(getDocsPath(), "manual", "jobs", "job-workflows.md");
  if (existsSync(workflowsPath)) {
    return readFileSync(workflowsPath, "utf-8");
  }

  // Fallback to index
  const indexPath = join(getDocsPath(), "manual", "jobs", "index.md");
  if (existsSync(indexPath)) {
    return readFileSync(indexPath, "utf-8");
  }

  return "Job workflows documentation not found";
}

/**
 * Get job options documentation
 */
export function getJobOptions(): string {
  const optionsPath = join(getDocsPath(), "manual", "jobs", "job-options.md");
  if (existsSync(optionsPath)) {
    return readFileSync(optionsPath, "utf-8");
  }
  return "Job options documentation not found";
}

/**
 * Get job examples by category
 */
export function getJobExamples(category?: string): string {
  // Try to find examples in learning/howto or manual/jobs
  const examplesPath = join(getDocsPath(), "learning", "howto", "use-example-jobs.md");
  if (existsSync(examplesPath)) {
    return readFileSync(examplesPath, "utf-8");
  }

  // Try creating jobs documentation
  const creatingPath = join(getDocsPath(), "manual", "jobs", "creating-jobs.md");
  if (existsSync(creatingPath)) {
    return readFileSync(creatingPath, "utf-8");
  }

  return "Job examples not found";
}

/**
 * Get job creation guide
 */
export function getJobCreationGuide(): string {
  const creatingPath = join(getDocsPath(), "manual", "jobs", "creating-jobs.md");
  if (existsSync(creatingPath)) {
    return readFileSync(creatingPath, "utf-8");
  }

  const learningPath = join(
    getDocsPath(),
    "learning",
    "getting-started",
    "jobs",
    "creating-a-job.md"
  );
  if (existsSync(learningPath)) {
    return readFileSync(learningPath, "utf-8");
  }

  return "Job creation guide not found";
}

