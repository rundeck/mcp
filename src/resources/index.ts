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
import {
  getManualIndex,
  getManualPath,
  getJobsManual,
  getNodesManual,
  getExecutionsManual,
  getCalendarsManual,
  getAwsSsmSetup,
  getPerformanceMonitoring,
} from "./manual.js";
import {
  getAdministrationIndex,
  getAdministrationPath,
  getClusterDocs,
  getConfigurationDocs,
  getInstallationDocs,
  getSecurityDocs,
  getRunnerDocs,
} from "./administration.js";
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
 * Handle resource URI and return content
 */
export function handleResource(uri: string): string {
  const url = new URL(uri);
  // For rundeck:// URIs, the hostname is the category (e.g., "api", "jobs")
  // and pathname is the resource (e.g., "/index", "/yaml-schema")
  const category = url.hostname;
  const resource = url.pathname;
  const path = category ? `/${category}${resource}` : resource;
  
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
        if (remaining.length === 1) {
          // Friendly named aliases
          if (section === "jobs") return getJobsManual();
          if (section === "nodes") return getNodesManual();
          if (section === "executions") return getExecutionsManual();
          if (section === "calendars") return getCalendarsManual();
          if (section === "aws-ssm" || section === "aws-ssm-setup") return getAwsSsmSetup();
          if (section === "performance" || section === "metrics" || section === "monitoring") return getPerformanceMonitoring();
        }
        // Pre-existing shortcut: the real file lives at
        // manual/projects/node-execution/aws-ssm.md, deeper than this
        // 2-segment alias — kept as a special case since getManualPath only
        // resolves the literal joined path.
        if (remaining.length === 2 && section === "projects" && topic === "aws-ssm") {
          return getAwsSsmSetup();
        }
        return getManualPath(remaining);
      }

      // Administration documentation: rundeck://docs/administration
      if (category === "administration") {
        const remaining = parts.slice(1);
        if (remaining.length === 0) {
          return getAdministrationIndex();
        }
        if (remaining.length === 1) {
          // Friendly named aliases
          if (section === "cluster") return getClusterDocs();
          if (section === "configuration") return getConfigurationDocs();
          if (section === "install") return getInstallationDocs();
          if (section === "security") return getSecurityDocs();
          if (section === "runner") return getRunnerDocs();
        }
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
        if (!section) {
          return getGettingStarted();
        } else if (section === "runners" || (section === "getting-started" && topic === "runners-overview")) {
          return getRunnersOverview();
        } else if (section === "howto" && topic) {
          return getHowTo(topic);
        } else if (section === "tutorial" && topic) {
          return getTutorial(topic);
        }
      }
    }

    return `Resource not found: ${uri}`;
  } catch (error) {
    return `Error loading resource ${uri}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Recursively discover subdirectories under a docs category (e.g. "manual",
 * "administration") and expose one resource URI per directory that contains
 * markdown content. This lets clients discover — and successfully read —
 * nested topics (e.g. `rundeck://docs/manual/projects/node-execution`) that
 * the static list below doesn't spell out individually.
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
  for (const file of markdownFiles) {
    let dir = dirname(file.replace(rootPath + "/", ""));
    while (dir && dir !== ".") {
      dirsWithMarkdown.add(dir);
      dir = dirname(dir);
    }
  }

  return Array.from(dirsWithMarkdown).map((relPath) => ({
    uri: `${uriPrefix}/${relPath}`,
    description: `${category} documentation: ${relPath.replace(/\//g, " > ")}`,
  }));
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
    
    // Reference resources
    { uri: "rundeck://ref/filters", description: "Node filter syntax" },
    { uri: "rundeck://ref/terms", description: "Rundeck terminology" },
    
    // Manual documentation (NEW - comprehensive)
    { uri: "rundeck://docs/manual", description: "Complete user manual index" },
    { uri: "rundeck://docs/manual/jobs", description: "Job documentation" },
    { uri: "rundeck://docs/manual/nodes", description: "Node documentation" },
    { uri: "rundeck://docs/manual/executions", description: "Execution documentation" },
    { uri: "rundeck://docs/manual/calendars", description: "Calendar documentation" },
    
    // Administration documentation (NEW - comprehensive)
    { uri: "rundeck://docs/administration", description: "Administration documentation index" },
    { uri: "rundeck://docs/administration/cluster", description: "Cluster setup and management" },
    { uri: "rundeck://docs/administration/configuration", description: "System configuration" },
    { uri: "rundeck://docs/administration/install", description: "Installation guides" },
    { uri: "rundeck://docs/administration/security", description: "Security configuration" },
    { uri: "rundeck://docs/administration/runner", description: "Runner documentation" },
    
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

  // Merge in dynamically discovered nested directories (e.g. `manual/projects/node-execution`)
  // so clients can find topics not called out explicitly above. Static entries win on conflict.
  const dynamicResources = [
    ...listDocDirectories("manual", "rundeck://docs/manual"),
    ...listDocDirectories("administration", "rundeck://docs/administration"),
  ];

  const byUri = new Map<string, { uri: string; description: string }>();
  for (const resource of [...staticResources, ...dynamicResources]) {
    if (!byUri.has(resource.uri)) {
      byUri.set(resource.uri, resource);
    }
  }
  return Array.from(byUri.values());
}

