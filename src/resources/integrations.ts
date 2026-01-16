/**
 * Integration documentation resources
 * Covers third-party integrations and alternatives
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { configManager } from "../config.js";
import { summarizeMarkdown } from "../utils/summarizer.js";

function getDocsPath(): string {
  return configManager.getConfig().docsPath;
}

/**
 * Get Salesforce integration alternatives (critical for validation)
 * Since direct Salesforce integration doesn't exist, document alternatives
 */
export function getSalesforceAlternatives(): string {
  const sections: string[] = [];
  
  sections.push("# Salesforce Integration Alternatives\n");
  sections.push("Rundeck does not have a direct Salesforce plugin, but you can integrate with Salesforce using the following approaches:\n");
  
  sections.push("## Option 1: HTTP/REST API Plugin\n");
  sections.push("Use Rundeck's HTTP/REST workflow step plugin to call Salesforce REST APIs:\n");
  sections.push("- Configure HTTP workflow steps to call Salesforce REST API endpoints");
  sections.push("- Use OAuth 2.0 for authentication (via HTTP headers)");
  sections.push("- Make GET/POST/PATCH requests to Salesforce API");
  sections.push("- Parse JSON responses in job steps\n");
  
  sections.push("**Resources:**");
  sections.push("- `rundeck://docs/manual/jobs` - Job workflow documentation");
  sections.push("- `rundeck://api` - API documentation for making HTTP calls\n");
  
  sections.push("## Option 2: Webhook Plugin\n");
  sections.push("Use webhooks to trigger Rundeck jobs from Salesforce:\n");
  sections.push("- Configure webhook endpoints in Rundeck");
  sections.push("- Set up Process Builder or Flow in Salesforce to call webhooks");
  sections.push("- Pass Salesforce data as webhook payload");
  sections.push("- Process data in Rundeck job steps\n");
  
  const webhookPath = join(getDocsPath(), "developer", "16-webhook-plugins.md");
  if (existsSync(webhookPath)) {
    sections.push("\n**Webhook Plugin Documentation:**\n");
    sections.push(summarizeMarkdown(readFileSync(webhookPath, "utf-8")));
  }
  
  sections.push("\n## Option 3: Custom Workflow Step Plugin\n");
  sections.push("Develop a custom workflow step plugin for Salesforce:\n");
  sections.push("- Use Salesforce REST API SDK");
  sections.push("- Create Java/Groovy plugin following Rundeck plugin development guide");
  sections.push("- Handle authentication and API calls");
  sections.push("- Return results to job workflow\n");
  
  sections.push("**Resources:**");
  sections.push("- `rundeck://docs/developer/plugins` - Plugin development guide");
  sections.push("- `rundeck://docs/developer/plugin/workflow-steps` - Workflow step plugin documentation\n");
  
  sections.push("## Option 4: RD CLI Scripting\n");
  sections.push("Use RD CLI in scripts that integrate with Salesforce:\n");
  sections.push("- Write scripts that call both RD CLI and Salesforce API");
  sections.push("- Use RD CLI to trigger jobs or query execution status");
  sections.push("- Use Salesforce API for Salesforce operations\n");
  
  sections.push("**Resources:**");
  sections.push("- `rundeck://docs/rd-cli/scripting` - RD CLI scripting guide\n");
  
  sections.push("## Recommended Approach\n");
  sections.push("For most use cases, **Option 1 (HTTP/REST API Plugin)** is the simplest and most flexible approach. It requires no custom development and leverages Rundeck's built-in HTTP capabilities.\n");
  
  return sections.join("\n");
}

