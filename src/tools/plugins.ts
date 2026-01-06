/**
 * Plugin creation tools
 */

import { z } from "zod";
import { logger } from "../utils/logger.js";

export interface PluginProperty {
  name: string;
  type: "String" | "Integer" | "Boolean" | "Long" | "Select";
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  values?: string[]; // For Select type
}

export const pluginCreateSchema = z.object({
  plugin_type: z.enum(["node-step", "workflow-step", "remote-script-node-step", "file-copier", "notification"])
    .describe("Type of plugin to create. Options: 'node-step' (executes on each node), 'workflow-step' (executes once per workflow), 'remote-script-node-step' (generates script/command for remote execution), 'file-copier' (copies files to nodes), 'notification' (sends notifications on job events)"),
  name: z.string().min(1).describe("Plugin name (provider name). Must be unique and follow Java naming conventions (e.g., 'my-custom-step', 'email-notification')"),
  class_name: z.string().min(1).regex(/^[A-Z][a-zA-Z0-9]*$/, "Class name must start with uppercase letter and follow Java naming conventions")
    .describe("Java class name (e.g., 'MyCustomStep', 'EmailNotification')"),
  description: z.string().optional().describe("Plugin description (optional)"),
  package_name: z.string().optional().default("com.rundeck.plugins")
    .describe("Java package name (default: 'com.rundeck.plugins')"),
  properties: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(["String", "Integer", "Boolean", "Long", "Select"]),
    description: z.string().optional(),
    required: z.boolean().optional().default(false),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    values: z.array(z.string()).optional(),
  })).optional().describe("Plugin configuration properties (optional)"),
  language: z.enum(["java", "groovy"]).optional().default("java")
    .describe("Target language (default: 'java')"),
});

export type PluginCreateParams = z.infer<typeof pluginCreateSchema>;

/**
 * Validate plugin name
 */
function validatePluginName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return { valid: false, error: "Plugin name cannot be empty" };
  }
  // Plugin names should be lowercase, alphanumeric with hyphens/underscores
  if (!/^[a-z0-9_-]+$/.test(name)) {
    return { valid: false, error: "Plugin name must be lowercase alphanumeric with hyphens or underscores only" };
  }
  return { valid: true };
}

/**
 * Validate class name
 */
function validateClassName(className: string): { valid: boolean; error?: string } {
  if (!className || className.length === 0) {
    return { valid: false, error: "Class name cannot be empty" };
  }
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(className)) {
    return { valid: false, error: "Class name must start with uppercase letter and contain only alphanumeric characters" };
  }
  return { valid: true };
}

/**
 * Generate Java property annotation
 */
function generatePropertyAnnotation(prop: PluginProperty): string {
  const defaultValue = prop.default !== undefined ? ` defaultValue = "${prop.default}"` : "";
  const values = prop.type === "Select" && prop.values ? ` values = {${prop.values.map(v => `"${v}"`).join(", ")}}` : "";
  const required = prop.required ? ", required = true" : "";
  const title = prop.description || prop.name;
  
  return `    @PluginProperty(title = "${title}"${required}${defaultValue}${values})
    private ${prop.type.toLowerCase()} ${prop.name};`;
}

/**
 * Generate service name constant
 */
function getServiceName(pluginType: string): string {
  const serviceMap: Record<string, string> = {
    "node-step": "WorkflowNodeStep",
    "workflow-step": "WorkflowStep",
    "remote-script-node-step": "RemoteScriptNodeStep",
    "file-copier": "FileCopier",
    "notification": "Notification",
  };
  return serviceMap[pluginType] || "WorkflowStep";
}

/**
 * Generate interface name
 */
function getInterfaceName(pluginType: string): string {
  const interfaceMap: Record<string, string> = {
    "node-step": "NodeStepPlugin",
    "workflow-step": "StepPlugin",
    "remote-script-node-step": "RemoteScriptNodeStepPlugin",
    "file-copier": "FileCopier",
    "notification": "NotificationPlugin",
  };
  return interfaceMap[pluginType] || "StepPlugin";
}

/**
 * Generate import statements
 */
function generateImports(pluginType: string, packageName: string): string {
  const imports: string[] = [
    `package ${packageName};`,
    "",
    "import com.dtolabs.rundeck.core.plugins.Plugin;",
    "import com.dtolabs.rundeck.plugins.descriptions.PluginDescription;",
    "import com.dtolabs.rundeck.plugins.descriptions.PluginProperty;",
  ];

  switch (pluginType) {
    case "node-step":
      imports.push(
        "import com.dtolabs.rundeck.core.execution.workflow.steps.node.NodeStepException;",
        "import com.dtolabs.rundeck.core.execution.workflow.steps.node.NodeStepPlugin;",
        "import com.dtolabs.rundeck.core.execution.workflow.steps.PluginStepContext;",
        "import com.dtolabs.rundeck.core.execution.workflow.steps.node.NodeStepResult;",
        "import com.dtolabs.rundeck.core.execution.workflow.steps.node.NodeStepResultImpl;",
        "import com.dtolabs.rundeck.core.storage.ResourceMeta;",
        "import org.rundeck.core.execution.workflow.steps.node.INodeEntry;"
      );
      break;
    case "workflow-step":
      imports.push(
        "import com.dtolabs.rundeck.core.execution.workflow.steps.StepException;",
        "import com.dtolabs.rundeck.core.execution.workflow.steps.StepPlugin;",
        "import com.dtolabs.rundeck.core.execution.workflow.steps.PluginStepContext;"
      );
      break;
    case "remote-script-node-step":
      imports.push(
        "import com.dtolabs.rundeck.core.execution.workflow.steps.node.NodeStepException;",
        "import com.dtolabs.rundeck.plugins.step.RemoteScriptNodeStepPlugin;",
        "import com.dtolabs.rundeck.plugins.step.GeneratedScript;",
        "import com.dtolabs.rundeck.plugins.step.GeneratedScriptBuilder;",
        "import com.dtolabs.rundeck.core.execution.workflow.steps.PluginStepContext;",
        "import org.rundeck.core.execution.workflow.steps.node.INodeEntry;"
      );
      break;
    case "file-copier":
      imports.push(
        "import com.dtolabs.rundeck.core.execution.service.FileCopierException;",
        "import com.dtolabs.rundeck.core.execution.service.FileCopier;",
        "import com.dtolabs.rundeck.core.execution.ExecutionContext;",
        "import org.rundeck.core.execution.workflow.steps.node.INodeEntry;",
        "import java.io.File;",
        "import java.io.InputStream;"
      );
      break;
    case "notification":
      imports.push(
        "import com.dtolabs.rundeck.core.plugins.configuration.PropertyScope;",
        "import com.dtolabs.rundeck.plugins.notification.NotificationPlugin;",
        "import java.util.Map;"
      );
      break;
  }

  return imports.join("\n");
}

/**
 * Generate method implementation based on plugin type
 */
function generateMethodImplementation(pluginType: string, className: string, properties: PluginProperty[]): string {
  switch (pluginType) {
    case "node-step":
      return `    @Override
    public NodeStepResult executeNodeStep(PluginStepContext context, java.util.Map<String, Object> configuration, INodeEntry entry) throws NodeStepException {
        try {
            // TODO: Implement your node step logic here
            // Access configuration properties: ${properties.map(p => p.name).join(", ")}
            // Access node information: entry.getHostname(), entry.getAttributes(), etc.
            // Log messages: context.getLogger().log(level, message)
            
            NodeStepResult result = new NodeStepResultImpl();
            result.setSuccess(true);
            return result;
        } catch (Exception e) {
            throw new NodeStepException(e, "FailureReason: " + e.getMessage());
        }
    }`;

    case "workflow-step":
      return `    @Override
    public void executeStep(PluginStepContext context, java.util.Map<String, Object> configuration) throws StepException {
        try {
            // TODO: Implement your workflow step logic here
            // Access configuration properties: ${properties.map(p => p.name).join(", ")}
            // Log messages: context.getLogger().log(level, message)
            
        } catch (Exception e) {
            throw new StepException(e.getMessage(), e);
        }
    }`;

    case "remote-script-node-step":
      return `    @Override
    public GeneratedScript generateScript(PluginStepContext context, java.util.Map<String, Object> configuration, INodeEntry entry) throws NodeStepException {
        try {
            // TODO: Implement your script generation logic here
            // Access configuration properties: ${properties.map(p => p.name).join(", ")}
            // Access node information: entry.getHostname(), entry.getAttributes(), etc.
            
            // Example: Generate a command
            // return GeneratedScriptBuilder.command("echo", "Hello World");
            
            // Example: Generate a script
            // return GeneratedScriptBuilder.script("#!/bin/bash\\necho 'Hello World'", new String[]{"arg1", "arg2"});
            
            throw new NodeStepException("Not implemented", "FailureReason: Script generation not implemented");
        } catch (Exception e) {
            throw new NodeStepException(e, "FailureReason: " + e.getMessage());
        }
    }`;

    case "file-copier":
      return `    @Override
    public String copyFile(ExecutionContext context, File file, INodeEntry node, String destination) throws FileCopierException {
        try {
            // TODO: Implement file copying logic here
            // Access configuration properties: ${properties.map(p => p.name).join(", ")}
            // Return the destination file path
            
            throw new FileCopierException("Not implemented");
        } catch (Exception e) {
            throw new FileCopierException(e.getMessage(), e);
        }
    }

    @Override
    public String copyFileStream(ExecutionContext context, InputStream input, INodeEntry node, String destination) throws FileCopierException {
        try {
            // TODO: Implement file stream copying logic here
            // Return the destination file path
            
            throw new FileCopierException("Not implemented");
        } catch (Exception e) {
            throw new FileCopierException(e.getMessage(), e);
        }
    }

    @Override
    public String copyScriptContent(ExecutionContext context, String script, INodeEntry node, String destination) throws FileCopierException {
        try {
            // TODO: Implement script content copying logic here
            // Return the destination file path
            
            throw new FileCopierException("Not implemented");
        } catch (Exception e) {
            throw new FileCopierException(e.getMessage(), e);
        }
    }`;

    case "notification":
      return `    @Override
    public boolean postNotification(String trigger, java.util.Map<String, Object> executionData, java.util.Map<String, Object> config) {
        try {
            // TODO: Implement notification logic here
            // Trigger values: "start", "success", "failure", "avgduration", "retryablefailure"
            // Access configuration properties: ${properties.map(p => p.name).join(", ")}
            // Access execution data: executionData.get("id"), executionData.get("status"), etc.
            
            return true; // Return true if notification was sent successfully
        } catch (Exception e) {
            // Log error and return false
            System.err.println("Notification failed: " + e.getMessage());
            return false;
        }
    }`;

    default:
      return "    // TODO: Implement plugin logic";
  }
}

/**
 * Generate plugin code
 */
export function pluginCreate(params: z.input<typeof pluginCreateSchema>): { code: string; warnings?: string[] } {
  // Parse and validate schema (applies defaults)
  const parsedParams = pluginCreateSchema.parse(params);
  
  logger.info(`Generating ${parsedParams.plugin_type} plugin: ${parsedParams.name}`);

  // Validate inputs
  const nameValidation = validatePluginName(parsedParams.name);
  if (!nameValidation.valid) {
    throw new Error(nameValidation.error);
  }

  const classValidation = validateClassName(parsedParams.class_name);
  if (!classValidation.valid) {
    throw new Error(classValidation.error);
  }

  const warnings: string[] = [];
  const packageName = parsedParams.package_name || "com.rundeck.plugins";
  const properties = parsedParams.properties || [];
  const serviceName = getServiceName(parsedParams.plugin_type);
  const interfaceName = getInterfaceName(parsedParams.plugin_type);

  // Generate imports
  const imports = generateImports(parsedParams.plugin_type, packageName);

  // Generate property fields
  const propertyFields = properties.map((prop: PluginProperty) => {
    const annotation = generatePropertyAnnotation(prop);
    return annotation;
  }).join("\n\n");

  // Generate method implementation
  const methodImplementation = generateMethodImplementation(parsedParams.plugin_type, parsedParams.class_name, properties);

  // Generate class
  const classCode = `${imports}

@Plugin(name = "${parsedParams.name}", service = "${serviceName}")
@PluginDescription(title = "${parsedParams.description || parsedParams.name}", description = "${parsedParams.description || `Custom ${parsedParams.plugin_type} plugin`}")
public class ${parsedParams.class_name} implements ${interfaceName} {
${propertyFields ? `\n${propertyFields}\n` : ""}
${methodImplementation}
}
`;

  // Add warnings
  if (properties.length === 0) {
    warnings.push("No configuration properties defined. Consider adding properties for plugin configuration.");
  }

  return {
    code: classCode,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

