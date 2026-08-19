/**
 * Job generation tools
 */

import { z } from "zod";
import * as yaml from "yaml";

export interface WorkflowStep {
  type: "command" | "script" | "jobref" | "plugin" | "conditional" | "export-var";
  exec?: string;
  script?: string;
  scriptfile?: string;
  scripturl?: string;
  /** Interpreter used to run the script, e.g. "/usr/bin/python3" or "powershell.exe". Required for non-shell scripts (Python, PowerShell). */
  scriptInterpreter?: string;
  /** Whether the interpreter args string should be quoted as a single argument. */
  interpreterArgsQuoted?: boolean;
  /** File extension for the generated script file, e.g. ".py" or ".ps1". PowerShell steps need this to run correctly. */
  fileExtension?: string;
  jobref?: {
    name: string;
    group?: string;
    args?: string;
  };
  plugin?: {
    type: string;
    configuration?: Record<string, unknown>;
  };
  nodeStep?: boolean;
  description?: string;
  /** Step to run if this step fails. Rundeck runs it in place, then still fails the workflow unless keepgoingOnSuccess is true. */
  errorhandler?: ErrorHandlerStep;
  /** Log filters that capture step output into data for use by later steps (${data.<name>}) or notifications. */
  logFilters?: LogFilter[];
  /** For type "conditional": groups of clauses to test. Clauses within a group are AND'd; groups are OR'd. */
  conditionGroups?: ConditionClause[][];
  /** For type "conditional": steps to run when the condition evaluates true. */
  subSteps?: WorkflowStep[];
  /** For type "export-var": exports a data value so it's visible outside sequence/data context, e.g. to notifications as ${export.<export>}. */
  exportVar?: {
    export: string;
    group?: string;
    value: string;
  };
}

export interface LogFilter {
  type: string;
  config?: Record<string, unknown>;
}

export interface ConditionClause {
  key: string;
  operator: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "matches";
  value: string;
}

export interface ErrorHandlerStep {
  exec?: string;
  script?: string;
  scriptfile?: string;
  scripturl?: string;
  scriptInterpreter?: string;
  interpreterArgsQuoted?: boolean;
  fileExtension?: string;
  plugin?: {
    type: string;
    configuration?: Record<string, unknown>;
  };
  nodeStep?: boolean;
  /** If true, a successful error handler counts the step as successful and the workflow continues. */
  keepgoingOnSuccess?: boolean;
}

export interface JobSchedule {
  crontab?: string;
  time?: {
    hour: string;
    minute: string;
    seconds?: string;
  };
  month?: string;
  year?: string;
  weekday?: { day: string };
  day?: { day: string };
}

export interface JobOption {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
  values?: string[];
  valuesUrl?: string;
  regex?: string;
  enforcedValues?: boolean;
  multivalued?: boolean;
  delimiter?: string;
  secure?: boolean;
  valueExposed?: boolean;
}

export interface NotificationHook {
  plugin: {
    type: string;
    configuration?: Record<string, unknown>;
  };
}

export interface JobNotification {
  onsuccess?: NotificationHook;
  onfailure?: NotificationHook;
  onstart?: NotificationHook;
}

/**
 * Targets a runner by tag instead of direct node reachability. Used for jobs
 * destined for a runner-based (SaaS) deployment rather than self-hosted Rundeck.
 */
export interface RunnerSelector {
  filter: string;
  runnerFilterMode?: "TAGS";
  runnerFilterType?: "TAG_FILTER_AND" | "TAG_FILTER_OR";
}

/**
 * Build a single workflow step's YAML/JSON representation, including
 * nested errorhandler, LogFilter plugins, and (for conditional steps)
 * recursively-built subSteps.
 */
function buildWorkflowCommand(step: WorkflowStep): Record<string, unknown> | null {
  let command: Record<string, unknown> | null = null;

  if (step.type === "command" && step.exec) {
    command = { exec: step.exec };
  } else if (step.type === "script" && (step.script || step.scriptfile || step.scripturl)) {
    const scriptStep: Record<string, unknown> = {};
    if (step.script) scriptStep.script = step.script;
    else if (step.scriptfile) scriptStep.scriptfile = step.scriptfile;
    else if (step.scripturl) scriptStep.scripturl = step.scripturl;
    if (step.scriptInterpreter) scriptStep.scriptInterpreter = step.scriptInterpreter;
    if (step.interpreterArgsQuoted !== undefined)
      scriptStep.interpreterArgsQuoted = step.interpreterArgsQuoted;
    if (step.fileExtension) scriptStep.fileExtension = step.fileExtension;
    command = scriptStep;
  } else if (step.type === "jobref" && step.jobref) {
    command = { jobref: step.jobref };
  } else if (step.type === "plugin" && step.plugin) {
    const pluginStep: Record<string, unknown> = {
      type: step.plugin.type,
    };
    if (step.nodeStep !== undefined) {
      pluginStep.nodeStep = step.nodeStep;
    }
    if (step.plugin.configuration) {
      pluginStep.configuration = step.plugin.configuration;
    }
    command = pluginStep;
  } else if (step.type === "conditional" && step.conditionGroups && step.subSteps) {
    command = {
      type: "conditional",
      conditionGroups: step.conditionGroups.map((group) =>
        group.map((clause) => ({
          key: clause.key,
          operator: clause.operator,
          value: clause.value,
        }))
      ),
      subSteps: step.subSteps
        .map((subStep) => buildWorkflowCommand(subStep))
        .filter((subCommand): subCommand is Record<string, unknown> => subCommand !== null),
    };
  } else if (step.type === "export-var" && step.exportVar) {
    command = {
      type: "export-var",
      nodeStep: false,
      configuration: {
        export: step.exportVar.export,
        group: step.exportVar.group || "export",
        value: step.exportVar.value,
      },
    };
  }

  if (command && step.errorhandler) {
    const handler = step.errorhandler;
    const errorhandlerStep: Record<string, unknown> = {};
    if (handler.script) errorhandlerStep.script = handler.script;
    else if (handler.scriptfile) errorhandlerStep.scriptfile = handler.scriptfile;
    else if (handler.scripturl) errorhandlerStep.scripturl = handler.scripturl;
    else if (handler.exec) errorhandlerStep.exec = handler.exec;
    else if (handler.plugin) {
      errorhandlerStep.type = handler.plugin.type;
      if (handler.plugin.configuration) errorhandlerStep.configuration = handler.plugin.configuration;
    }
    if (handler.scriptInterpreter) errorhandlerStep.scriptInterpreter = handler.scriptInterpreter;
    if (handler.interpreterArgsQuoted !== undefined)
      errorhandlerStep.interpreterArgsQuoted = handler.interpreterArgsQuoted;
    if (handler.fileExtension) errorhandlerStep.fileExtension = handler.fileExtension;
    if (handler.nodeStep !== undefined) errorhandlerStep.nodeStep = handler.nodeStep;
    if (handler.keepgoingOnSuccess !== undefined)
      errorhandlerStep.keepgoingOnSuccess = handler.keepgoingOnSuccess;
    command.errorhandler = errorhandlerStep;
  }

  if (command && step.logFilters && step.logFilters.length > 0) {
    command.plugins = {
      LogFilter: step.logFilters.map((f) => {
        const filter: Record<string, unknown> = { type: f.type };
        if (f.config) filter.config = f.config;
        return filter;
      }),
    };
  }

  return command;
}

/**
 * Generate a Rundeck job definition
 */
export function rundeckGenerateJob(params: {
  name: string;
  description?: string;
  project: string;
  workflow_steps: WorkflowStep[];
  node_filter?: string;
  runnerSelector?: RunnerSelector;
  options?: JobOption[];
  format?: "yaml" | "json";
  group?: string;
  loglevel?: "DEBUG" | "VERBOSE" | "INFO" | "WARN" | "ERROR";
  timeout?: string;
  retry?: number | string;
  multipleExecutions?: boolean;
  schedule?: JobSchedule;
  notification?: JobNotification;
}): string {
  const format = params.format || "yaml";
  const loglevel = params.loglevel || "INFO";

  // Build workflow sequence
  const commands: unknown[] = [];
  for (const step of params.workflow_steps) {
    const command = buildWorkflowCommand(step);
    if (command) {
      commands.push(command);
    }
  }

  const job: Record<string, unknown> = {
    name: params.name,
    description: params.description || "",
    loglevel,
    sequence: {
      commands,
    },
  };

  if (params.group) {
    job.group = params.group;
  }

  if (params.node_filter) {
    job.nodefilters = {
      filter: params.node_filter,
    };
  }

  if (params.runnerSelector) {
    job.runnerSelector = params.runnerSelector;
  }

  if (params.options && params.options.length > 0) {
    const options: Record<string, unknown>[] = [];
    for (const opt of params.options) {
      const optionDef: Record<string, unknown> = {
        name: opt.name,
      };
      if (opt.description) optionDef.description = opt.description;
      if (opt.required !== undefined) optionDef.required = opt.required;
      if (opt.default !== undefined) optionDef.default = opt.default;
      if (opt.values) optionDef.values = opt.values;
      if (opt.valuesUrl) optionDef.valuesUrl = opt.valuesUrl;
      if (opt.regex) optionDef.regex = opt.regex;
      if (opt.enforcedValues !== undefined)
        optionDef.enforcedValues = opt.enforcedValues;
      if (opt.multivalued !== undefined) optionDef.multivalued = opt.multivalued;
      if (opt.delimiter) optionDef.delimiter = opt.delimiter;
      if (opt.secure !== undefined) optionDef.secure = opt.secure;
      if (opt.valueExposed !== undefined)
        optionDef.valueExposed = opt.valueExposed;
      options.push(optionDef);
    }
    job.options = options;
  }

  if (params.timeout) {
    job.timeout = params.timeout;
  }

  if (params.retry !== undefined) {
    job.retry = params.retry;
  }

  if (params.multipleExecutions !== undefined) {
    job.multipleExecutions = params.multipleExecutions;
  }

  if (params.schedule) {
    job.schedule = params.schedule;
  }

  if (params.notification) {
    const notification: Record<string, unknown> = {};
    if (params.notification.onsuccess) notification.onsuccess = params.notification.onsuccess;
    if (params.notification.onfailure) notification.onfailure = params.notification.onfailure;
    if (params.notification.onstart) notification.onstart = params.notification.onstart;
    if (Object.keys(notification).length > 0) {
      job.notification = notification;
    }
  }

  if (format === "yaml") {
    return yaml.stringify([job], { indent: 2 });
  } else {
    return JSON.stringify([job], null, 2);
  }
}

/**
 * Validate a job definition
 */
/**
 * Recursively checks a parsed sequence's commands (and any conditional
 * step's subSteps) for a "conditional" step type.
 */
function containsConditionalStep(commands: unknown[]): boolean {
  for (const command of commands) {
    if (typeof command !== "object" || command === null) continue;
    const commandObj = command as Record<string, unknown>;
    if (commandObj.type === "conditional") return true;
    if (Array.isArray(commandObj.subSteps) && containsConditionalStep(commandObj.subSteps)) {
      return true;
    }
  }
  return false;
}

/**
 * Counts capturing groups in a regex source string (non-capturing groups,
 * lookaheads/lookbehinds excluded). Used to flag LogFilter regexes that
 * won't capture the fields they claim to.
 */
function countCaptureGroups(pattern: string): number {
  let count = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "\\") {
      i++;
      continue;
    }
    if (pattern[i] !== "(") continue;
    if (pattern[i + 1] !== "?") {
      count++;
      continue;
    }
    const marker = pattern[i + 2];
    if (marker === ":" || marker === "=" || marker === "!") continue; // non-capturing / lookahead
    if (marker === "<" && (pattern[i + 3] === "=" || pattern[i + 3] === "!")) continue; // lookbehind
    count++; // named capturing group (?<name>...)
  }
  return count;
}

// Fields that some common Rundeck plugins validate as literals at import
// time, rejecting ${option.x}/${data.x} substitution even though the field
// accepts a plain string.
const LITERAL_ONLY_PLUGIN_FIELDS = ["outputFormat", "objectType", "imagePullPolicy", "duration"];

/**
 * Recursively walks a parsed sequence's commands (including conditional
 * subSteps and errorhandlers) collecting non-fatal correctness warnings
 * that are cheap to check deterministically.
 */
function collectStepWarnings(commands: unknown[], warnings: string[]): void {
  for (const command of commands) {
    if (typeof command !== "object" || command === null) continue;
    const commandObj = command as Record<string, unknown>;

    const plugins = commandObj.plugins as Record<string, unknown> | undefined;
    if (plugins && Array.isArray(plugins.LogFilter)) {
      for (const filter of plugins.LogFilter) {
        if (typeof filter !== "object" || filter === null) continue;
        const filterObj = filter as Record<string, unknown>;
        if (filterObj.type === "key-value-data") {
          const config = filterObj.config as Record<string, unknown> | undefined;
          const regex = config?.regex;
          if (typeof regex === "string") {
            const groups = countCaptureGroups(regex);
            if (groups === 1 && !config?.name) {
              warnings.push(
                `LogFilter 'key-value-data' regex '${regex}' has 1 capture group but no 'name' set; ` +
                "with a single capture group the 'name' field is required to name the captured value"
              );
            } else if (groups !== 1 && groups !== 2) {
              warnings.push(
                `LogFilter 'key-value-data' regex '${regex}' has ${groups} capture group(s); expected 1 (with 'name' set) ` +
                "or 2 (key, value), or the capture will silently fail"
              );
            }
          }
        }
      }
    }

    if (typeof commandObj.type === "string" && commandObj.configuration && typeof commandObj.configuration === "object") {
      const config = commandObj.configuration as Record<string, unknown>;
      for (const field of LITERAL_ONLY_PLUGIN_FIELDS) {
        const value = config[field];
        if (typeof value === "string" && value.includes("${")) {
          warnings.push(
            `Plugin '${commandObj.type}' field '${field}' contains '\${...}' substitution; some Rundeck plugins validate this field as a literal at import time and will reject a dynamic value here`
          );
        }
      }
    }

    if (Array.isArray(commandObj.subSteps)) {
      collectStepWarnings(commandObj.subSteps, warnings);
    }
    if (commandObj.errorhandler && typeof commandObj.errorhandler === "object") {
      collectStepWarnings([commandObj.errorhandler], warnings);
    }
  }
}

export function rundeckValidateJob(params: {
  job_definition: string;
  format: "yaml" | "json";
}): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

    try {
      let job: unknown;

      if (params.format === "yaml") {
        job = yaml.parse(params.job_definition);
      } else {
        job = JSON.parse(params.job_definition);
      }

    // Basic validation
    if (!Array.isArray(job) && typeof job === "object") {
      job = [job];
    }

    if (!Array.isArray(job)) {
      errors.push("Job definition must be an array or object");
      return { valid: false, errors, warnings };
    }

    for (const jobItem of job as unknown[]) {
      if (typeof jobItem !== "object" || jobItem === null) {
        errors.push("Each job must be an object");
        continue;
      }

      const jobObj = jobItem as Record<string, unknown>;

      // Required fields
      if (!jobObj.name || typeof jobObj.name !== "string") {
        errors.push("Job must have a 'name' field (string)");
      }

      if (!jobObj.loglevel || typeof jobObj.loglevel !== "string") {
        errors.push("Job must have a 'loglevel' field (string)");
      } else {
        const validLevels = ["DEBUG", "VERBOSE", "INFO", "WARN", "ERROR"];
        if (!validLevels.includes(jobObj.loglevel as string)) {
          errors.push(
            `Invalid loglevel: ${jobObj.loglevel}. Must be one of: ${validLevels.join(", ")}`
          );
        }
      }

      if (!jobObj.sequence || typeof jobObj.sequence !== "object") {
        errors.push("Job must have a 'sequence' field (object)");
      } else {
        const sequence = jobObj.sequence as Record<string, unknown>;
        if (!Array.isArray(sequence.commands)) {
          errors.push("Job sequence must have a 'commands' array");
        } else if (sequence.commands.length === 0) {
          warnings.push("Job has no workflow steps");
        } else {
          if (
            sequence.strategy === "node-first" &&
            containsConditionalStep(sequence.commands)
          ) {
            errors.push(
              "Conditional workflow steps (type: 'conditional') are not compatible with sequence.strategy 'node-first'"
            );
          }
          collectStepWarnings(sequence.commands, warnings);
        }
      }

      if (!jobObj.description) {
        warnings.push("Job has no description");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(
      `Failed to parse ${params.format}: ${error instanceof Error ? error.message : String(error)}`
    );
    return { valid: false, errors, warnings };
  }
}

/**
 * Get a job template
 */
export function rundeckGetJobTemplate(params: {
  template_type: string;
}): string {
  const templates: Record<string, string> = {
    "simple-command": `- name: Simple Command Job
  description: A simple job that runs a command
  loglevel: INFO
  sequence:
    commands:
      - exec: echo "Hello, World!"`,

    "multi-step": `- name: Multi-Step Job
  description: A job with multiple workflow steps
  loglevel: INFO
  sequence:
    commands:
      - exec: echo "Step 1"
      - exec: echo "Step 2"
      - exec: echo "Step 3"`,

    scheduled: `- name: Scheduled Job
  description: A job that runs on a schedule
  loglevel: INFO
  schedule:
    time:
      hour: '0'
      minute: '0'
  sequence:
    commands:
      - exec: echo "Scheduled task"`,

    "with-options": `- name: Job with Options
  description: A job that accepts user input via options
  loglevel: INFO
  options:
    - name: message
      description: Message to display
      required: true
      default: "Hello"
  sequence:
    commands:
      - exec: echo "Message: \${option.message}"`,
  };

  const template = templates[params.template_type];
  if (!template) {
    const available = Object.keys(templates).join(", ");
    return `Template "${params.template_type}" not found. Available templates: ${available}`;
  }

  return template;
}

// Zod schemas
export const jobScheduleSchema = z.object({
  crontab: z.string()
    .optional()
    .describe(
      "Quartz cron expression (6-7 fields: sec min hour dayOfMonth month dayOfWeek [year]). " +
      "Examples: '0 0 * * * ?' (every hour), '0 0/5 * * * ?' (every 5 min), '0 30 8 ? * MON-FRI' (8:30 weekdays)"
    ),
  time: z.object({
    hour: z.string().describe("Hour (0-23)"),
    minute: z.string().describe("Minute (0-59)"),
    seconds: z.string().optional().describe("Seconds (0-59), defaults to '0'"),
  }).optional().describe("Structured time (alternative to crontab)"),
  month: z.string().optional().describe("Month pattern, e.g. '*', '1,6,12'"),
  year: z.string().optional().describe("Year pattern, e.g. '*'"),
  weekday: z.object({ day: z.string() }).optional().describe("Weekday pattern, e.g. { day: 'MON-FRI' }"),
  day: z.object({ day: z.string() }).optional().describe("Day-of-month pattern, e.g. { day: '1' }"),
}).refine(
  (s) => s.crontab !== undefined || s.time !== undefined || s.month !== undefined || s.year !== undefined || s.weekday !== undefined || s.day !== undefined,
  { message: "schedule must include at least one field (crontab, time, month, year, weekday, or day)" }
).describe(
  "Schedule definition. Use 'crontab' for a single Quartz expression, or the structured fields for a UI-style schedule. " +
  "Only one approach is needed. Example crontab: '0 0 8 ? * MON-FRI' (8 AM weekdays)."
);

const notificationHookSchema = z.object({
  plugin: z.object({
    type: z.string().describe(
      "Notification plugin type. Example: 'PagerDutyEventNotification'."
    ),
    configuration: z.record(z.unknown()).optional(),
  }),
});

export const jobNotificationSchema = z.object({
  onsuccess: notificationHookSchema.optional(),
  onfailure: notificationHookSchema.optional(),
  onstart: notificationHookSchema.optional(),
}).describe(
  "Notifications fired on job lifecycle events. Note: values captured via a step's LogFilter " +
  "('${data.<name>}') are not visible inside notification config — export them first with an " +
  "'export-var' workflow step and reference them as '${export.<name>}'."
);

export const workflowStepSchema: z.ZodType<WorkflowStep> = z.lazy(() => z.object({
  type: z.enum(["command", "script", "jobref", "plugin", "conditional", "export-var"]),
  exec: z.string().optional(),
  script: z.string().optional(),
  scriptfile: z.string().optional(),
  scripturl: z.string().url().optional(),
  scriptInterpreter: z.string()
    .optional()
    .describe(
      "Interpreter used to run the script. Required for non-shell scripts. " +
      "Examples: 'python3', 'powershell.exe'"
    ),
  interpreterArgsQuoted: z.boolean()
    .optional()
    .describe("Whether the interpreter args string should be quoted as a single argument."),
  fileExtension: z.string()
    .optional()
    .describe(
      "File extension for the generated script file. Required for some interpreters to behave correctly. " +
      "Examples: '.py', '.ps1'"
    ),
  jobref: z
    .object({
      name: z.string(),
      group: z.string().optional(),
      args: z.string().optional(),
    })
    .optional(),
  plugin: z
    .object({
      type: z.string(),
      configuration: z.record(z.unknown()).optional(),
    })
    .optional(),
  nodeStep: z.boolean().optional(),
  description: z.string().optional(),
  errorhandler: z.object({
    exec: z.string().optional(),
    script: z.string().optional(),
    scriptfile: z.string().optional(),
    scripturl: z.string().url().optional(),
    scriptInterpreter: z.string().optional(),
    interpreterArgsQuoted: z.boolean().optional(),
    fileExtension: z.string().optional(),
    plugin: z
      .object({
        type: z.string(),
        configuration: z.record(z.unknown()).optional(),
      })
      .optional(),
    nodeStep: z.boolean().optional(),
    keepgoingOnSuccess: z.boolean()
      .optional()
      .describe(
        "If true, a successful error handler counts the step as successful and the workflow continues. " +
        "If false/omitted, the step is still marked failed even if the error handler succeeds."
      ),
  })
    .optional()
    .describe(
      "Step to run if this step fails, e.g. a cleanup command or notification. " +
      "Runs in place of failure handling; combine with keepgoingOnSuccess to continue the workflow on handler success."
    ),
  logFilters: z.array(
    z.object({
      type: z.string().describe(
        "Log filter plugin type. Common built-ins: 'key-value-data' (parses 'key=value' lines), " +
        "'key-value-data-multilines' (same, with a delimited-lines mode), 'json-mapper' (parses JSON output into data)."
      ),
      config: z.record(z.unknown())
        .optional()
        .describe(
          "Filter-specific config. For 'key-value-data': { regex, name?, logData?, matchSubstrings?, allowMultipleMatches? }. " +
          "'regex' must have 1 or 2 capture groups: 2 groups = (key, value); 1 group = the value, and 'name' " +
          "must then be set to the key name. Any other count silently fails to capture at runtime. " +
          "For 'key-value-data-multilines', the same fields plus 'captureMultipleKeysValues'."
        ),
    })
  )
    .optional()
    .describe(
      "Log filters that capture this step's output into data, since steps otherwise run in isolated " +
      "shells with no shared state. Captured values are referenced downstream as ${data.<name>}."
    ),
  conditionGroups: z.array(
    z.array(
      z.object({
        key: z.string().describe("Data or option key to test, e.g. 'option.environment' or 'data.exitCode'."),
        operator: z.enum(["==", "!=", ">", ">=", "<", "<=", "contains", "matches"]),
        value: z.string(),
      })
    )
  )
    .optional()
    .describe(
      "For type 'conditional': groups of clauses to test. Clauses within a group are AND'd; " +
      "groups are OR'd together. Requires 'subSteps' to also be set."
    ),
  subSteps: z.array(workflowStepSchema)
    .optional()
    .describe(
      "For type 'conditional': steps to run when the condition evaluates true. Requires 'conditionGroups' to also be set."
    ),
  exportVar: z.object({
    export: z.string().describe("Name the exported value is referenced by, e.g. 'result' for ${export.result}."),
    group: z.string().optional().describe("Export group name. Defaults to 'export'."),
    value: z.string().describe("Value to export, typically a reference like '${data.someKey}'."),
  })
    .optional()
    .describe(
      "For type 'export-var': makes a captured data value (from a LogFilter) visible outside " +
      "step/sequence data context, e.g. in notifications, as ${export.<export>}."
    ),
})).refine(
  (step) => !(step.type === "conditional" && (!step.conditionGroups || !step.subSteps)),
  { message: "conditional steps require both 'conditionGroups' and 'subSteps'" }
);

export const jobOptionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.string().optional(),
  values: z.array(z.string()).optional(),
  valuesUrl: z.string().url().optional(),
  regex: z.string().optional(),
  enforcedValues: z.boolean().optional(),
  multivalued: z.boolean().optional(),
  delimiter: z.string().optional(),
  secure: z.boolean().optional(),
  valueExposed: z.boolean().optional(),
});

export const rundeckGenerateJobSchema = z.object({
  name: z.string().describe(
    "Job name. Must be unique within the project. " +
    "Example: 'Deploy Application', 'Backup Database', 'Run Health Check'"
  ),
  description: z.string()
    .optional()
    .describe(
      "Job description. Provides context about what the job does. " +
      "Example: 'Deploys the latest version of the application to production servers'"
    ),
  project: z.string()
    .describe(
      "Project name. The Rundeck project this job belongs to. " +
      "Example: 'production', 'development', 'infrastructure'"
    ),
  workflow_steps: z.array(workflowStepSchema)
    .describe(
      "Array of workflow step definitions. Each step defines a command, script, job reference, or plugin to execute. " +
      "Example: [{ type: 'command', exec: 'echo Hello' }, { type: 'script', script: '#!/bin/bash\\necho World' }]"
    ),
  node_filter: z.string()
    .optional()
    .describe(
      "Node filter expression. Determines which nodes the job targets. " +
      "Examples: 'tags: production', 'name: web-.*', 'tags: web AND os-family: linux'"
    ),
  runnerSelector: z.object({
    filter: z.string().describe("Tag filter expression selecting which runner(s) execute this job."),
    runnerFilterMode: z.literal("TAGS").optional(),
    runnerFilterType: z.enum(["TAG_FILTER_AND", "TAG_FILTER_OR"]).optional(),
  })
    .optional()
    .describe(
      "Targets a runner by tag instead of node_filter's direct node reachability. Use for jobs " +
      "destined for a runner-based (SaaS / PagerDuty Process Automation) deployment rather than self-hosted Rundeck."
    ),
  options: z.array(jobOptionSchema)
    .optional()
    .describe(
      "Job options. Allow users to provide input when running the job. " +
      "Example: [{ name: 'environment', description: 'Target environment', required: true, values: ['dev', 'prod'] }]"
    ),
  format: z.enum(["yaml", "json"])
    .optional()
    .default("yaml")
    .describe("Output format. YAML is recommended for readability. Default: 'yaml'"),
  group: z.string()
    .optional()
    .describe(
      "Job group. Organizes jobs into logical groups. " +
      "Example: 'Deployment', 'Maintenance', 'Monitoring'"
    ),
  loglevel: z.enum(["DEBUG", "VERBOSE", "INFO", "WARN", "ERROR"])
    .optional()
    .default("INFO")
    .describe(
      "Log level. Controls verbosity of job execution logs. " +
      "Options: DEBUG (most verbose), VERBOSE, INFO (default), WARN, ERROR (least verbose)"
    ),
  timeout: z.string()
    .optional()
    .describe(
      "Job timeout. Maximum time the job can run before being killed. " +
      "Examples: '1h', '30m', '2h30m', '3600s'"
    ),
  retry: z.union([z.number(), z.string()])
    .optional()
    .describe(
      "Number of retries. How many times to retry failed steps. " +
      "Can be a number (e.g., 3) or string (e.g., '3')"
    ),
  multipleExecutions: z.boolean()
    .optional()
    .describe(
      "Allow multiple simultaneous executions. " +
      "If true, the job can run multiple times concurrently. Default: false"
    ),
  schedule: jobScheduleSchema.optional(),
  notification: jobNotificationSchema.optional(),
});

export const rundeckValidateJobSchema = z.object({
  job_definition: z.string()
    .describe(
      "Job definition as a YAML or JSON string. " +
      "Example YAML: 'name: My Job\\nproject: my-project\\nsequence:\\n  commands:\\n    - exec: echo Hello' " +
      "Example JSON: '{\"name\":\"My Job\",\"project\":\"my-project\",\"sequence\":{\"commands\":[{\"exec\":\"echo Hello\"}]}}'"
    ),
  format: z.enum(["yaml", "json"])
    .describe(
      "Format of the job definition. Must match the actual format of job_definition. " +
      "Use 'yaml' for YAML format, 'json' for JSON format"
    ),
});

export const rundeckGetJobTemplateSchema = z.object({
  template_type: z.enum(["simple-command", "multi-step", "scheduled", "with-options"]).describe("Template type"),
});

