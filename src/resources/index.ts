/**
 * Resource handler - maps URIs to documentation content
 */

import { getApiIndex, getApiAuthentication, getApiEndpoint, getApiExamples } from "./api.js";
import {
  getYamlJobSchema,
  getJsonJobSchema,
  getXmlJobSchema,
  getJobWorkflows,
  getJobOptions,
  getJobExamples,
} from "./jobs.js";
import {
  getSystemConfig,
  getProjectConfig,
  getPluginConfig,
  getConfigExamples,
} from "./config.js";
import { getGettingStarted, getHowTo, getTutorial, getRunnersOverview } from "./learning.js";
import {
  getPluginOverview,
  getPlugin,
  getNodeStepPlugins,
  getWorkflowStepPlugins,
} from "./plugins.js";
import { getPagerDutyStepReference, getKubernetesStepReference } from "./plugin-reference.js";
import {
  getManualIndex,
  getManualPath,
  getNodesManual,
  getExecutionsManual,
  getAwsSsmSetup,
  getPerformanceMonitoring,
} from "./manual.js";
import { getAdministrationIndex, getAdministrationPath } from "./administration.js";
import {
  getDeveloperIndex,
  getPluginDevelopmentDocs,
  getPluginTypeDocs,
  getDeveloperTopic,
} from "./developer.js";
import {
  getRdCliIndex,
  getRdCliTopic,
  getRdCliCommands,
  getRdCliScripting,
} from "./rd-cli.js";
import {
  getSalesforceAlternatives,
} from "./integrations.js";
import { readFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { configManager } from "../config.js";
import { logger } from "../utils/logger.js";
import { findMarkdownFiles } from "../parsers/markdown.js";

function getDocsPath(): string {
  return configManager.getConfig().docsPath;
}

/**
 * A named shortcut under manual/ or administration/ that doesn't correspond
 * 1:1 to a plain filesystem path — either a friendlier name for a real
 * section (e.g. `jobs` -> manual/jobs), or a pointer to content that lives
 * deeper than the alias's own path (e.g. `projects/aws-ssm` -> the file at
 * manual/projects/node-execution/aws-ssm.md). Defined once and consumed by
 * both handleResource (routing) and listResources (discovery) so the two
 * can't drift apart the way they did before — a URI that resolves is
 * guaranteed to also be listed, and vice versa.
 */
interface DocAlias {
  segments: string[];
  description: string;
  resolve: () => string;
}

// Deliberately small: every entry here maps a friendly name to content that
// getManualPath/getAdministrationPath cannot reach by resolving the literal
// path — either because the target file is named or nested differently than
// the alias (nodes -> 05-nodes.md, aws-ssm -> projects/node-execution/aws-ssm.md),
// or because it's a synthesized multi-file resource with no single backing
// file (performance/metrics/monitoring). Anything that matches a real
// directory or file 1:1 (jobs, calendars, cluster, configuration, install,
// security, runner, ...) needs no entry at all — getManualPath/
// getAdministrationPath already resolve it generically.
const MANUAL_ALIASES: DocAlias[] = [
  { segments: ["nodes"], description: "Node documentation", resolve: getNodesManual },
  { segments: ["executions"], description: "Execution documentation", resolve: getExecutionsManual },
  { segments: ["aws-ssm"], description: "AWS SSM plugin setup guide", resolve: getAwsSsmSetup },
  { segments: ["aws-ssm-setup"], description: "AWS SSM plugin setup guide", resolve: getAwsSsmSetup },
  { segments: ["performance"], description: "Performance monitoring and metrics", resolve: getPerformanceMonitoring },
  { segments: ["metrics"], description: "Performance monitoring and metrics", resolve: getPerformanceMonitoring },
  { segments: ["monitoring"], description: "Performance monitoring and metrics", resolve: getPerformanceMonitoring },
  {
    segments: ["projects", "aws-ssm"],
    description: "AWS SSM plugin setup guide (shortcut for projects/node-execution/aws-ssm)",
    resolve: getAwsSsmSetup,
  },
];

// Every administration friendly name (cluster, configuration, install,
// security, runner) matches a real top-level directory 1:1, so
// getAdministrationPath already resolves all of them generically — nothing
// here needs a non-derivable alias today. Kept as an empty table (rather
// than removed) so routing and listing keep reading from one shared
// mechanism if a real one is ever needed.
const ADMINISTRATION_ALIASES: DocAlias[] = [];

function matchAlias(aliases: DocAlias[], remaining: string[]): DocAlias | undefined {
  return aliases.find(
    (alias) =>
      alias.segments.length === remaining.length &&
      alias.segments.every((segment, i) => segment === remaining[i])
  );
}

/**
 * Handle resource URI and return content
 */
export function handleResource(uri: string): string {
  const url = new URL(uri);
  // For rundeck:// URIs, the hostname is the category (e.g., "api", "jobs")
  // and pathname is the resource (e.g., "/index", "/yaml-schema")
  const category = url.hostname;
  const resource = url.pathname;
  let path = category ? `/${category}${resource}` : resource;
  // Tolerate a guessed trailing ".md" — every doc here is a markdown file on
  // disk, so clients naturally try appending it even though URIs are
  // extension-less; stripping it avoids a needless round trip.
  if (path.endsWith(".md")) {
    path = path.slice(0, -3);
  }

  // Check for query parameters (e.g., ?format=yaml)
  const format = url.searchParams.get("format") || null;

  try {
    // API resources
    if (path.startsWith("/api/") || path === "/api") {
      // rundeck://api (index)
      if (path === "/api") {
        return getApiIndex();
      } 
      // rundeck://api/auth
      else if (path === "/api/auth") {
        return getApiAuthentication();
      } 
      // rundeck://api/examples (unchanged)
      else if (path === "/api/examples") {
        return getApiExamples();
      } 
      // rundeck://api/endpoint/{path}
      else if (path.startsWith("/api/endpoint/")) {
        const endpointPath = decodeURIComponent(path.replace("/api/endpoint/", ""));
        return getApiEndpoint(endpointPath);
      }
    }

    // Job resources
    if (path.startsWith("/jobs/")) {
      // rundeck://jobs/schema?format=yaml|json|xml
      if (path === "/jobs/schema") {
        const schemaFormat = format || "yaml";
        if (schemaFormat === "yaml") {
          return getYamlJobSchema();
        } else if (schemaFormat === "json") {
          return getJsonJobSchema();
        } else if (schemaFormat === "xml") {
          return getXmlJobSchema();
        }
      } 
      // Unchanged URIs
      else if (path === "/jobs/workflows") {
        return getJobWorkflows();
      } else if (path === "/jobs/options") {
        return getJobOptions();
      } else if (path.startsWith("/jobs/examples/")) {
        const category = path.replace("/jobs/examples/", "");
        return getJobExamples(category);
      }
    }

    // Configuration resources
    if (path.startsWith("/config/") || path === "/config") {
      // rundeck://config (index)
      if (path === "/config") {
        return getSystemConfig();
      } else if (path === "/config/system") {
        return getSystemConfig();
      } else if (path === "/config/project") {
        return getProjectConfig();
      } else if (path === "/config/plugins") {
        return getPluginConfig();
      } else if (path.startsWith("/config/examples/")) {
        const type = path.replace("/config/examples/", "");
        return getConfigExamples(type);
      }
    }

    // Learning resources
    if (path.startsWith("/learn")) {
      // rundeck://learn (getting started)
      if (path === "/learn") {
        return getGettingStarted();
      } 
      else if (path === "/learn/runners") {
        return getRunnersOverview();
      }
      else if (path.startsWith("/learn/howto/")) {
        const topic = path.replace("/learn/howto/", "");
        return getHowTo(topic);
      } else if (path.startsWith("/learn/tutorial/")) {
        const lesson = path.replace("/learn/tutorial/", "");
        return getTutorial(lesson);
      }
    }

    // Plugin resources
    if (path.startsWith("/plugins/") || path === "/plugins") {
      // rundeck://plugins (index)
      if (path === "/plugins") {
        return getPluginOverview();
      } else if (path === "/plugins/node-steps") {
        return getNodeStepPlugins();
      } else if (path === "/plugins/workflow-steps") {
        return getWorkflowStepPlugins();
      } else if (path === "/plugins/step-types/pagerduty") {
        return getPagerDutyStepReference();
      } else if (path === "/plugins/step-types/kubernetes") {
        return getKubernetesStepReference();
      } else if (path.match(/^\/plugins\/\w+\/\w+$/)) {
        const parts = path.split("/");
        const type = parts[2];
        const name = parts[3];
        return getPlugin(type, name);
      }
    }

    // Reference resources
    if (path.startsWith("/ref/")) {
      // rundeck://ref/filters
      if (path === "/ref/filters") {
        const nodeFiltersPath = join(getDocsPath(), "manual", "11-node-filters.md");
        if (existsSync(nodeFiltersPath)) {
          return readFileSync(nodeFiltersPath, "utf-8");
        }
      } 
      // rundeck://ref/terms
      else if (path === "/ref/terms") {
        const terminologyPath = join(
          getDocsPath(),
          "learning",
          "tutorial",
          "terminology.md"
        );
        if (existsSync(terminologyPath)) {
          return readFileSync(terminologyPath, "utf-8");
        }
      }
      // rundeck://ref/runners (for validation question)
      else if (path === "/ref/runners") {
        return getRunnersOverview();
      }
    }
    
    // Quick access resources for validation questions
    if (path === "/aws-ssm-setup") {
      return getAwsSsmSetup();
    }
    if (path === "/runners") {
      return getRunnersOverview();
    }
    if (path === "/performance-monitoring" || path === "/metrics") {
      return getPerformanceMonitoring();
    }
    if (path === "/salesforce" || path === "/salesforce-alternatives") {
      return getSalesforceAlternatives();
    }

    // New hierarchical docs structure: rundeck://docs/{category}/{section}/{topic}
    if (path.startsWith("/docs/")) {
      const docsPath = path.replace("/docs/", "");
      const parts = docsPath.split("/");
      const category = parts[0];
      const section = parts[1];
      const topic = parts[2];

      // Manual documentation: rundeck://docs/manual
      if (category === "manual") {
        // Path segments after "manual" — may be arbitrarily deep
        // (e.g. ["projects", "node-execution", "ssh"]).
        const remaining = parts.slice(1);
        if (remaining.length === 0) {
          return getManualIndex();
        }
        const alias = matchAlias(MANUAL_ALIASES, remaining);
        if (alias) return alias.resolve();
        return getManualPath(remaining);
      }

      // Administration documentation: rundeck://docs/administration
      if (category === "administration") {
        const remaining = parts.slice(1);
        if (remaining.length === 0) {
          return getAdministrationIndex();
        }
        const alias = matchAlias(ADMINISTRATION_ALIASES, remaining);
        if (alias) return alias.resolve();
        return getAdministrationPath(remaining);
      }

      // Developer documentation: rundeck://docs/developer
      if (category === "developer") {
        if (!section) {
          return getDeveloperIndex();
        } else if (section === "plugins") {
          return getPluginDevelopmentDocs();
        } else if (section === "plugin" && topic) {
          return getPluginTypeDocs(topic);
        } else {
          return getDeveloperTopic(section);
        }
      }

      // RD CLI documentation: rundeck://docs/rd-cli
      if (category === "rd-cli") {
        if (!section) {
          return getRdCliIndex();
        } else if (section === "commands") {
          return getRdCliCommands();
        } else if (section === "scripting") {
          return getRdCliScripting();
        } else {
          return getRdCliTopic(section);
        }
      }
      
      // Integrations documentation: rundeck://docs/integrations
      if (category === "integrations") {
        if (section === "salesforce" || (!section && topic === "salesforce")) {
          return getSalesforceAlternatives();
        }
      }

      // API documentation: rundeck://docs/api (alias for rundeck://api)
      if (category === "api") {
        if (!section) {
          return getApiIndex();
        } else if (section === "auth") {
          return getApiAuthentication();
        } else if (section === "examples") {
          return getApiExamples();
        }
      }

      // Learning documentation: rundeck://docs/learning (alias for rundeck://learn)
      if (category === "learning") {
        // Full remaining path after the section (e.g. "acls/group-readonly"),
        // not just parts[2] — howto/tutorial guides can be nested in
        // subdirectories (e.g. learning/howto/acls/*.md).
        const remaining = parts.slice(2).join("/");
        if (!section) {
          return getGettingStarted();
        } else if (section === "runners" || (section === "getting-started" && topic === "runners-overview")) {
          return getRunnersOverview();
        } else if (section === "howto" && remaining) {
          return getHowTo(remaining);
        } else if (section === "tutorial" && remaining) {
          return getTutorial(remaining);
        }
      }
    }

    return `Resource not found: ${uri}`;
  } catch (error) {
    return `Error loading resource ${uri}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Recursively discover every markdown file and subdirectory under a docs
 * category (e.g. "manual", "administration") and expose one resource URI
 * each. This lets clients discover — via listResources(), not just direct
 * ReadResource calls — both nested directories (e.g.
 * `rundeck://docs/manual/projects/node-execution`) and individual nested
 * files (e.g. `.../node-execution/ssh`) that the static list below doesn't
 * spell out individually. Without the per-file entries, a client that only
 * reads resources it first saw in listResources() would never be able to
 * reach a leaf topic, even though ReadResource could resolve it directly.
 */
function listDocDirectories(
  category: string,
  uriPrefix: string
): Array<{ uri: string; description: string }> {
  const rootPath = join(getDocsPath(), category);
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    return [];
  }

  // Single recursive scan for markdown files, then derive every ancestor
  // directory from each file's path — avoids re-scanning the same subtree
  // once per directory, and keeps a thrown error (e.g. an unreadable
  // subdirectory) from taking down the whole listResources() response.
  let markdownFiles: string[];
  try {
    markdownFiles = findMarkdownFiles(rootPath);
  } catch (error) {
    logger.error(`Failed to scan ${category} docs for resource discovery`, error);
    return [];
  }

  const dirsWithMarkdown = new Set<string>();
  const fileEntries: Array<{ uri: string; description: string }> = [];
  for (const file of markdownFiles) {
    const relFile = file.replace(rootPath + "/", "");
    const relFileNoExt = relFile.replace(/\.md$/, "");
    fileEntries.push({
      uri: `${uriPrefix}/${relFileNoExt}`,
      description: `${category} documentation: ${relFileNoExt.replace(/\//g, " > ")}`,
    });

    let dir = dirname(relFile);
    while (dir && dir !== ".") {
      dirsWithMarkdown.add(dir);
      dir = dirname(dir);
    }
  }

  const dirEntries = Array.from(dirsWithMarkdown).map((relPath) => ({
    uri: `${uriPrefix}/${relPath}`,
    description: `${category} documentation: ${relPath.replace(/\//g, " > ")}`,
  }));

  return [...dirEntries, ...fileEntries];
}

/**
 * List available resources
 */
export function listResources(): Array<{ uri: string; description: string }> {
  const staticResources: Array<{ uri: string; description: string }> = [
    // API resources
    { uri: "rundeck://api", description: "Complete API reference" },
    { uri: "rundeck://api/auth", description: "API authentication methods" },
    { uri: "rundeck://api/examples", description: "API usage examples" },
    { uri: "rundeck://docs/api", description: "API documentation (alias)" },
    
    // Job resources
    { uri: "rundeck://jobs/schema", description: "Job schema (YAML/JSON/XML - use ?format=yaml|json|xml)" },
    { uri: "rundeck://jobs/workflows", description: "Workflow strategies" },
    { uri: "rundeck://jobs/options", description: "Job options documentation" },
    
    // Configuration resources
    { uri: "rundeck://config", description: "Configuration index" },
    { uri: "rundeck://config/system", description: "System configuration reference" },
    { uri: "rundeck://config/project", description: "Project configuration" },
    { uri: "rundeck://config/plugins", description: "Plugin configuration" },
    
    // Learning resources
    { uri: "rundeck://learn", description: "Getting started guide" },
    { uri: "rundeck://docs/learning", description: "Learning documentation (alias)" },
    
    // Plugin resources
    { uri: "rundeck://plugins", description: "Plugin overview" },
    { uri: "rundeck://plugins/step-types/pagerduty", description: "PagerDuty workflow step plugin reference (type strings and configuration fields)" },
    { uri: "rundeck://plugins/step-types/kubernetes", description: "Kubernetes workflow step plugin reference (kubernetes-clusters-* family)" },
    
    // Reference resources
    { uri: "rundeck://ref/filters", description: "Node filter syntax" },
    { uri: "rundeck://ref/terms", description: "Rundeck terminology" },
    
    // Manual documentation index (per-alias entries below are generated from
    // MANUAL_ALIASES, the same table handleResource routes through)
    { uri: "rundeck://docs/manual", description: "Complete user manual index" },

    // Administration documentation index (per-alias entries below are
    // generated from ADMINISTRATION_ALIASES, the same table handleResource
    // routes through)
    { uri: "rundeck://docs/administration", description: "Administration documentation index" },

    // Developer documentation (NEW - comprehensive)
    { uri: "rundeck://docs/developer", description: "Developer documentation index" },
    { uri: "rundeck://docs/developer/plugins", description: "Plugin development overview" },
    { uri: "rundeck://docs/developer/plugin/step-plugins", description: "Step plugin development" },
    { uri: "rundeck://docs/developer/plugin/node-execution-plugins", description: "Node execution plugins" },
    { uri: "rundeck://docs/developer/plugin/file-copier-plugins", description: "File copier plugins" },
    { uri: "rundeck://docs/developer/plugin/notification-plugins", description: "Notification plugins" },
    
    // RD CLI documentation (NEW - comprehensive)
    { uri: "rundeck://docs/rd-cli", description: "RD CLI documentation index" },
    { uri: "rundeck://docs/rd-cli/commands", description: "Command reference" },
    { uri: "rundeck://docs/rd-cli/scripting", description: "Scripting guide" },
    
    // Quick access resources for common questions
    { uri: "rundeck://aws-ssm-setup", description: "AWS SSM plugin setup guide" },
    { uri: "rundeck://runners", description: "Runners overview and importance" },
    { uri: "rundeck://performance-monitoring", description: "Performance monitoring and metrics" },
    { uri: "rundeck://salesforce-alternatives", description: "Salesforce integration alternatives" },
    
    // Integrations documentation
    { uri: "rundeck://docs/integrations/salesforce", description: "Salesforce integration alternatives" },
  ];

  // Alias entries generated from the same tables handleResource routes
  // through, so a URI can never be readable without also being listed (or
  // vice versa).
  const aliasResources = [
    ...MANUAL_ALIASES.map((alias) => ({
      uri: `rundeck://docs/manual/${alias.segments.join("/")}`,
      description: alias.description,
    })),
    ...ADMINISTRATION_ALIASES.map((alias) => ({
      uri: `rundeck://docs/administration/${alias.segments.join("/")}`,
      description: alias.description,
    })),
  ];

  // Merge in dynamically discovered nested directories (e.g. `manual/projects/node-execution`)
  // so clients can find topics not called out explicitly above. Static entries win on conflict.
  const dynamicResources = [
    ...listDocDirectories("manual", "rundeck://docs/manual"),
    ...listDocDirectories("administration", "rundeck://docs/administration"),
    ...listDocDirectories("learning/howto", "rundeck://docs/learning/howto"),
    ...listDocDirectories("learning/tutorial", "rundeck://docs/learning/tutorial"),
  ];

  const byUri = new Map<string, { uri: string; description: string }>();
  for (const resource of [...staticResources, ...aliasResources, ...dynamicResources]) {
    if (!byUri.has(resource.uri)) {
      byUri.set(resource.uri, resource);
    }
  }
  return Array.from(byUri.values());
}

