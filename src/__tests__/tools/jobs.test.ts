/**
 * Tests for job generation tools
 */

import * as yaml from "yaml";
import {
  rundeckGenerateJob,
  rundeckValidateJob,
  rundeckGetJobTemplate,
  workflowStepSchema,
  rundeckGenerateJobSchema,
} from "../../tools/jobs.js";

describe("Job Tools", () => {
  describe("rundeckGenerateJob", () => {
    it("should generate a basic job in YAML format", () => {
      const result = rundeckGenerateJob({
        name: "Test Job",
        description: "A test job",
        project: "test-project",
        workflow_steps: [
          {
            type: "command",
            exec: "echo 'Hello World'",
          },
        ],
        format: "yaml",
      });

      expect(result).toContain("name: Test Job");
      expect(result).toContain("description: A test job");
      // Note: project is not part of job definition, it's used when importing
      expect(result).toContain("exec: echo 'Hello World'");
      expect(result).toContain("loglevel: INFO");
    });

    it("should generate a job in JSON format", () => {
      const result = rundeckGenerateJob({
        name: "Test Job",
        project: "test-project",
        workflow_steps: [
          {
            type: "command",
            exec: "echo test",
          },
        ],
        format: "json",
      });

      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe("Test Job");
      expect(parsed[0].sequence.commands).toHaveLength(1);
    });

    it("should include job options when provided", () => {
      const result = rundeckGenerateJob({
        name: "Job with Options",
        project: "test-project",
        workflow_steps: [
          {
            type: "command",
            exec: "echo ${option.message}",
          },
        ],
        options: [
          {
            name: "message",
            description: "Message to display",
            required: true,
            default: "Hello",
          },
        ],
      });

      expect(result).toContain("options:");
      expect(result).toContain("name: message");
      expect(result).toContain("description: Message to display");
    });

    it("should include node filter when provided", () => {
      const result = rundeckGenerateJob({
        name: "Filtered Job",
        project: "test-project",
        workflow_steps: [
          {
            type: "command",
            exec: "echo test",
          },
        ],
        node_filter: "tags: production",
      });

      expect(result).toContain("nodefilters:");
      expect(result).toContain("tags: production");
    });

    it("should handle multiple workflow steps", () => {
      const result = rundeckGenerateJob({
        name: "Multi-step Job",
        project: "test-project",
        workflow_steps: [
          {
            type: "command",
            exec: "step 1",
          },
          {
            type: "command",
            exec: "step 2",
          },
        ],
      });

      const yamlLines = result.split("\n");
      const execLines = yamlLines.filter((line) => line.includes("exec:"));
      expect(execLines.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle script steps", () => {
      const result = rundeckGenerateJob({
        name: "Script Job",
        project: "test-project",
        workflow_steps: [
          {
            type: "script",
            script: "#!/bin/bash\necho 'test'",
          },
        ],
      });

      expect(result).toContain("script:");
    });

    it("should include script interpreter fields for a script step", () => {
      const result = rundeckGenerateJob({
        name: "PowerShell Job",
        project: "test-project",
        workflow_steps: [
          {
            type: "script",
            script: "Write-Output 'hi'",
            scriptInterpreter: "powershell.exe",
            interpreterArgsQuoted: true,
            fileExtension: ".ps1",
          },
        ],
      });

      expect(result).toContain("scriptInterpreter: powershell.exe");
      expect(result).toContain("interpreterArgsQuoted: true");
      expect(result).toContain("fileExtension: .ps1");
    });

    it("should not include script interpreter fields when omitted", () => {
      const result = rundeckGenerateJob({
        name: "Plain Script Job",
        project: "test-project",
        workflow_steps: [{ type: "script", script: "echo hi" }],
      });

      expect(result).not.toContain("scriptInterpreter");
      expect(result).not.toContain("interpreterArgsQuoted");
      expect(result).not.toContain("fileExtension");
    });

    it("should include errorhandler on a step", () => {
      const result = rundeckGenerateJob({
        name: "Errorhandler Job",
        project: "test-project",
        workflow_steps: [
          {
            type: "command",
            exec: "risky-command",
            errorhandler: {
              exec: "cleanup-command",
              keepgoingOnSuccess: true,
            },
          },
        ],
      });

      const parsed = yaml.parse(result);
      const step = parsed[0].sequence.commands[0];
      expect(step.errorhandler.exec).toBe("cleanup-command");
      expect(step.errorhandler.keepgoingOnSuccess).toBe(true);
    });

    it("should not include errorhandler when omitted", () => {
      const result = rundeckGenerateJob({
        name: "No Errorhandler Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo hi" }],
      });

      expect(result).not.toContain("errorhandler");
    });

    it("should include LogFilter plugins on a step", () => {
      const result = rundeckGenerateJob({
        name: "LogFilter Job",
        project: "test-project",
        workflow_steps: [
          {
            type: "command",
            exec: "echo key=value",
            logFilters: [
              {
                type: "key-value-data",
                config: { regex: "(.+)=(.+)", logData: "true" },
              },
            ],
          },
        ],
      });

      const parsed = yaml.parse(result);
      const step = parsed[0].sequence.commands[0];
      expect(step.plugins.LogFilter[0].type).toBe("key-value-data");
      expect(step.plugins.LogFilter[0].config.regex).toBe("(.+)=(.+)");
    });

    it("should not include plugins.LogFilter when omitted", () => {
      const result = rundeckGenerateJob({
        name: "Plain Command Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo hi" }],
      });

      expect(result).not.toContain("LogFilter");
    });

    it("should generate a conditional.logic step with nested steps", () => {
      const result = rundeckGenerateJob({
        name: "Conditional Job",
        project: "test-project",
        workflow_steps: [
          {
            type: "conditional.logic",
            conditionGroups: [
              { conditions: [{ field: "${option.environment}", operator: "equals", value: "prod" }] },
            ],
            steps: [{ type: "command", exec: "echo prod" }],
          },
        ],
      });

      const parsed = yaml.parse(result);
      const step = parsed[0].sequence.commands[0];
      expect(step.type).toBe("conditional.logic");
      expect(step.conditionGroups[0].conditions[0]).toEqual({
        field: "${option.environment}",
        operator: "equals",
        value: "prod",
      });
      expect(step.steps[0].exec).toBe("echo prod");
    });

    it("should accept all six real conditional operators", () => {
      for (const operator of ["equals", "not equals", "contains", "matches", "greater than", "less than"] as const) {
        const result = workflowStepSchema.safeParse({
          type: "conditional.logic",
          conditionGroups: [{ conditions: [{ field: "${option.environment}", operator, value: "prod" }] }],
          steps: [{ type: "command", exec: "echo prod" }],
        });
        expect(result.success).toBe(true);
      }
    });

    it("should omit a conditional.logic step missing conditionGroups or steps", () => {
      const result = rundeckGenerateJob({
        name: "Incomplete Conditional Job",
        project: "test-project",
        workflow_steps: [{ type: "conditional.logic" }],
      });

      const parsed = yaml.parse(result);
      expect(parsed[0].sequence.commands).toHaveLength(0);
    });

    it("should generate an export-var step", () => {
      const result = rundeckGenerateJob({
        name: "Export Var Job",
        project: "test-project",
        workflow_steps: [
          {
            type: "export-var",
            exportVar: { export: "result", value: "${data.result}" },
          },
        ],
      });

      const parsed = yaml.parse(result);
      const step = parsed[0].sequence.commands[0];
      expect(step.type).toBe("export-var");
      expect(step.configuration.export).toBe("result");
      expect(step.configuration.group).toBe("export");
      expect(step.configuration.value).toBe("${data.result}");
    });

    it("should include a notification block with multiple hooks per trigger", () => {
      const result = rundeckGenerateJob({
        name: "Notification Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo hi" }],
        notification: {
          onfailure: [
            {
              plugin: {
                type: "PagerDutyEventNotification",
                configuration: { serviceKey: "abc123" },
              },
            },
            { email: { recipients: "oncall@example.com" } },
          ],
          onavgduration: [{ email: { recipients: "slow-jobs@example.com" } }],
        },
        notifyAvgDurationThreshold: "+30",
      });

      const parsed = yaml.parse(result);
      expect(parsed[0].notification.onfailure[0].plugin.type).toBe(
        "PagerDutyEventNotification"
      );
      expect(parsed[0].notification.onfailure[1].email.recipients).toBe("oncall@example.com");
      expect(parsed[0].notification.onavgduration[0].email.recipients).toBe("slow-jobs@example.com");
      expect(parsed[0].notifyAvgDurationThreshold).toBe("+30");
    });

    it("should not include notifyAvgDurationThreshold without onavgduration", () => {
      const result = rundeckGenerateJob({
        name: "No Avg Duration Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo hi" }],
        notification: {
          onfailure: [{ email: { recipients: "oncall@example.com" } }],
        },
        notifyAvgDurationThreshold: "+30",
      });

      expect(result).not.toContain("notifyAvgDurationThreshold");
    });

    it("should not include a notification block when omitted", () => {
      const result = rundeckGenerateJob({
        name: "No Notification Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo hi" }],
      });

      expect(result).not.toContain("notification:");
    });

    it("should include a runnerSelector block", () => {
      const result = rundeckGenerateJob({
        name: "Runner Selector Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo hi" }],
        runnerSelector: {
          filter: "env=prod",
          runnerFilterMode: "TAGS",
          runnerFilterType: "TAG_FILTER_AND",
        },
      });

      const parsed = yaml.parse(result);
      expect(parsed[0].runnerSelector.filter).toBe("env=prod");
      expect(parsed[0].runnerSelector.runnerFilterType).toBe("TAG_FILTER_AND");
    });

    it("should not include runnerSelector when omitted", () => {
      const result = rundeckGenerateJob({
        name: "No Runner Selector Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo hi" }],
      });

      expect(result).not.toContain("runnerSelector");
    });

    it("should accept LOCAL_RUNNER/FILTER/LOCAL runnerSelector enum values", () => {
      const result = rundeckGenerateJobSchema.safeParse({
        name: "Local Runner Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo hi" }],
        runnerSelector: {
          filter: "runner-1",
          runnerFilterMode: "LOCAL",
          runnerFilterType: "LOCAL_RUNNER",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should include crontab schedule in YAML output", () => {
      const result = rundeckGenerateJob({
        name: "Scheduled Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo scheduled" }],
        schedule: { crontab: "0 30 8 ? * MON-FRI" },
      });

      expect(result).toContain("schedule:");
      expect(result).toContain("crontab: 0 30 8 ? * MON-FRI");
    });

    it("should include crontab schedule in JSON output", () => {
      const result = rundeckGenerateJob({
        name: "Scheduled Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo scheduled" }],
        schedule: { crontab: "0 0 * * * ?" },
        format: "json",
      });

      const parsed = JSON.parse(result);
      expect(parsed[0].schedule).toBeDefined();
      expect(parsed[0].schedule.crontab).toBe("0 0 * * * ?");
    });

    it("should include structured time schedule in YAML output", () => {
      const result = rundeckGenerateJob({
        name: "Structured Schedule Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo structured" }],
        schedule: {
          time: { hour: "8", minute: "30", seconds: "0" },
          weekday: { day: "MON-FRI" },
          month: "*",
        },
      });

      expect(result).toContain("schedule:");
      expect(result).toContain("hour: \"8\"");
      expect(result).toContain("minute: \"30\"");
      expect(result).toContain("day: MON-FRI");
      expect(result).toContain("month: \"*\"");
    });

    it("should not include schedule block when schedule is omitted", () => {
      const result = rundeckGenerateJob({
        name: "No Schedule Job",
        project: "test-project",
        workflow_steps: [{ type: "command", exec: "echo no-schedule" }],
      });

      expect(result).not.toContain("schedule:");
    });
  });

  describe("rundeckValidateJob", () => {
    it("should validate a correct YAML job", () => {
      const jobYaml = `- name: Test Job
  description: Test
  loglevel: INFO
  sequence:
    commands:
      - exec: echo test`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate a correct JSON job", () => {
      const jobJson = JSON.stringify([
        {
          name: "Test Job",
          description: "Test",
          loglevel: "INFO",
          sequence: {
            commands: [{ exec: "echo test" }],
          },
        },
      ]);

      const result = rundeckValidateJob({
        job_definition: jobJson,
        format: "json",
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing required fields", () => {
      const jobYaml = `- description: Test
  loglevel: INFO`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    });

    it("should detect invalid loglevel", () => {
      const jobYaml = `- name: Test
  loglevel: INVALID
  sequence:
    commands:
      - exec: test`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("loglevel"))).toBe(true);
    });

    it("should warn about missing description", () => {
      const jobYaml = `- name: Test
  loglevel: INFO
  sequence:
    commands:
      - exec: test`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.warnings.some((w) => w.includes("description"))).toBe(
        true
      );
    });

    it("should reject a conditional.logic step combined with the default (node-first) strategy", () => {
      const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    commands:
      - type: conditional.logic
        conditionGroups:
          - conditions:
              - field: "\${option.environment}"
                operator: equals
                value: prod
        steps:
          - exec: echo prod`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("node-first"))).toBe(true);
    });

    it("should reject a conditional.logic step combined with explicit node-first or ruleset strategy", () => {
      for (const strategy of ["node-first", "ruleset"]) {
        const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    strategy: ${strategy}
    commands:
      - type: conditional.logic
        conditionGroups:
          - conditions:
              - field: "\${option.environment}"
                operator: equals
                value: prod
        steps:
          - exec: echo prod`;

        const result = rundeckValidateJob({
          job_definition: jobYaml,
          format: "yaml",
        });

        expect(result.valid).toBe(false);
      }
    });

    it("should allow a conditional.logic step with step-first or parallel strategy", () => {
      for (const strategy of ["step-first", "parallel"]) {
        const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    strategy: ${strategy}
    commands:
      - type: conditional.logic
        conditionGroups:
          - conditions:
              - field: "\${option.environment}"
                operator: equals
                value: prod
        steps:
          - exec: echo prod`;

        const result = rundeckValidateJob({
          job_definition: jobYaml,
          format: "yaml",
        });

        expect(result.valid).toBe(true);
      }
    });

    it("should reject a nested conditional.logic step", () => {
      const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    strategy: step-first
    commands:
      - type: conditional.logic
        conditionGroups:
          - conditions:
              - field: "\${option.environment}"
                operator: equals
                value: prod
        steps:
          - type: conditional.logic
            conditionGroups:
              - conditions:
                  - field: "\${option.other}"
                    operator: equals
                    value: x
            steps:
              - exec: echo nested`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Nested"))).toBe(true);
    });

    it("should warn about errorhandler on a step nested inside a conditional.logic step", () => {
      const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    strategy: step-first
    commands:
      - type: conditional.logic
        conditionGroups:
          - conditions:
              - field: "\${option.environment}"
                operator: equals
                value: prod
        steps:
          - exec: echo prod
            errorhandler:
              exec: echo cleanup`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("nested inside"))).toBe(true);
    });

    it("should warn about a single-capture-group key-value-data regex with no 'name' set", () => {
      const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    commands:
      - exec: echo key=value
        plugins:
          LogFilter:
            - type: key-value-data
              config:
                regex: "(.+)"`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("capture group"))).toBe(true);
    });

    it("should not warn about a single-capture-group key-value-data regex with 'name' set", () => {
      const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    commands:
      - exec: echo value
        plugins:
          LogFilter:
            - type: key-value-data
              config:
                regex: "(.+)"
                name: myVar`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.warnings.some((w) => w.includes("capture group"))).toBe(false);
    });

    it("should not warn about a key-value-data LogFilter regex with exactly 2 capture groups", () => {
      const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    commands:
      - exec: echo key=value
        plugins:
          LogFilter:
            - type: key-value-data
              config:
                regex: "(.+)=(.+)"`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.warnings.some((w) => w.includes("capture group"))).toBe(false);
    });

    it("should warn about a key-value-data LogFilter regex with 3 capture groups", () => {
      const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    commands:
      - exec: echo a=b=c
        plugins:
          LogFilter:
            - type: key-value-data
              config:
                regex: "(.+)=(.+)=(.+)"`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.warnings.some((w) => w.includes("capture group"))).toBe(true);
    });

    it("should warn about a literal-only plugin field containing a substitution", () => {
      const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    commands:
      - type: some-plugin
        configuration:
          outputFormat: "\${option.format}"`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.warnings.some((w) => w.includes("outputFormat"))).toBe(true);
    });

    it("should not warn about a literal-only plugin field with a plain value", () => {
      const jobYaml = `- name: Test Job
  loglevel: INFO
  sequence:
    commands:
      - type: some-plugin
        configuration:
          outputFormat: json`;

      const result = rundeckValidateJob({
        job_definition: jobYaml,
        format: "yaml",
      });

      expect(result.warnings.some((w) => w.includes("outputFormat"))).toBe(false);
    });

    it("should detect invalid YAML syntax", () => {
      const invalidYaml = `- name: Test
  invalid: [unclosed`;

      const result = rundeckValidateJob({
        job_definition: invalidYaml,
        format: "yaml",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("rundeckGetJobTemplate", () => {
    it("should return template for simple-command", () => {
      const template = rundeckGetJobTemplate({
        template_type: "simple-command",
      });

      expect(template).toContain("name:");
      expect(template).toContain("sequence:");
      expect(template).toContain("commands:");
    });

    it("should return template for multi-step", () => {
      const template = rundeckGetJobTemplate({
        template_type: "multi-step",
      });

      expect(template).toContain("Multi-Step");
    });

    it("should return template for scheduled", () => {
      const template = rundeckGetJobTemplate({
        template_type: "scheduled",
      });

      expect(template).toContain("Scheduled");
      expect(template).toContain("schedule:");
    });

    it("should return template for with-options", () => {
      const template = rundeckGetJobTemplate({
        template_type: "with-options",
      });

      expect(template).toContain("Options");
      expect(template).toContain("options:");
    });

    it("should return error message for unknown template", () => {
      const template = rundeckGetJobTemplate({
        template_type: "unknown-template",
      });

      expect(template).toContain("not found");
      expect(template).toContain("Available templates");
    });
  });
});

