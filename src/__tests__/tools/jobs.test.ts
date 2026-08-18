/**
 * Tests for job generation tools
 */

import * as yaml from "yaml";
import {
  rundeckGenerateJob,
  rundeckValidateJob,
  rundeckGetJobTemplate,
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

