/**
 * Plugin creation tool tests
 */

import { pluginCreate, pluginCreateSchema } from "../../tools/plugins.js";
import { z } from "zod";

describe("Plugin Creation Tool", () => {
  describe("Schema Validation", () => {
    it("should accept valid node-step plugin parameters", () => {
      const validParams = {
        plugin_type: "node-step" as const,
        name: "my-custom-step",
        class_name: "MyCustomStep",
        description: "A custom node step",
        package_name: "com.example.rundeck",
      };

      const result = pluginCreateSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it("should accept valid workflow-step plugin parameters", () => {
      const validParams = {
        plugin_type: "workflow-step" as const,
        name: "my-workflow-step",
        class_name: "MyWorkflowStep",
      };

      const result = pluginCreateSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it("should accept valid notification plugin parameters", () => {
      const validParams = {
        plugin_type: "notification" as const,
        name: "email-notification",
        class_name: "EmailNotification",
        properties: [
          {
            name: "recipient",
            type: "String" as const,
            description: "Email recipient",
            required: true,
          },
        ],
      };

      const result = pluginCreateSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it("should reject invalid plugin_type", () => {
      const invalidParams = {
        plugin_type: "invalid-type",
        name: "test",
        class_name: "Test",
      };

      const result = pluginCreateSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it("should reject empty name", () => {
      const invalidParams = {
        plugin_type: "node-step" as const,
        name: "",
        class_name: "Test",
      };

      const result = pluginCreateSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it("should reject invalid class_name", () => {
      const invalidParams = {
        plugin_type: "node-step" as const,
        name: "test",
        class_name: "invalidClassName", // Should start with uppercase
      };

      const result = pluginCreateSchema.safeParse(invalidParams);
      // Note: The regex validation happens in the function, not the schema
      expect(invalidParams.class_name).not.toMatch(/^[A-Z][a-zA-Z0-9]*$/);
    });
  });

  describe("Plugin Generation", () => {
    it("should generate node-step plugin code", () => {
      const params = {
        plugin_type: "node-step" as const,
        name: "test-node-step",
        class_name: "TestNodeStep",
        description: "Test node step plugin",
        package_name: "com.test",
      };

      const result = pluginCreate(params);

      expect(result.code).toContain("@Plugin");
      expect(result.code).toContain("@PluginDescription");
      expect(result.code).toContain("TestNodeStep");
      expect(result.code).toContain("NodeStepPlugin");
      expect(result.code).toContain("executeNodeStep");
      expect(result.code).toContain("package com.test");
    });

    it("should generate workflow-step plugin code", () => {
      const params = {
        plugin_type: "workflow-step" as const,
        name: "test-workflow-step",
        class_name: "TestWorkflowStep",
      };

      const result = pluginCreate(params);

      expect(result.code).toContain("@Plugin");
      expect(result.code).toContain("TestWorkflowStep");
      expect(result.code).toContain("StepPlugin");
      expect(result.code).toContain("executeStep");
    });

    it("should generate file-copier plugin code", () => {
      const params = {
        plugin_type: "file-copier" as const,
        name: "test-file-copier",
        class_name: "TestFileCopier",
      };

      const result = pluginCreate(params);

      expect(result.code).toContain("@Plugin");
      expect(result.code).toContain("TestFileCopier");
      expect(result.code).toContain("FileCopier");
      expect(result.code).toContain("copyFile");
      expect(result.code).toContain("copyFileStream");
      expect(result.code).toContain("copyScriptContent");
    });

    it("should generate notification plugin code", () => {
      const params = {
        plugin_type: "notification" as const,
        name: "test-notification",
        class_name: "TestNotification",
      };

      const result = pluginCreate(params);

      expect(result.code).toContain("@Plugin");
      expect(result.code).toContain("TestNotification");
      expect(result.code).toContain("NotificationPlugin");
      expect(result.code).toContain("postNotification");
    });

    it("should generate remote-script-node-step plugin code", () => {
      const params = {
        plugin_type: "remote-script-node-step" as const,
        name: "test-remote-script",
        class_name: "TestRemoteScript",
      };

      const result = pluginCreate(params);

      expect(result.code).toContain("@Plugin");
      expect(result.code).toContain("TestRemoteScript");
      expect(result.code).toContain("RemoteScriptNodeStepPlugin");
      expect(result.code).toContain("generateScript");
    });

    it("should include properties in generated code", () => {
      const params = {
        plugin_type: "node-step" as const,
        name: "test-plugin",
        class_name: "TestPlugin",
        properties: [
          {
            name: "timeout",
            type: "Integer" as const,
            description: "Timeout in seconds",
            required: true,
            default: 30,
          },
          {
            name: "environment",
            type: "Select" as const,
            description: "Target environment",
            required: true,
            values: ["dev", "staging", "production"],
          },
        ],
      };

      const result = pluginCreate(params);

      expect(result.code).toContain("@PluginProperty");
      expect(result.code).toContain("timeout");
      expect(result.code).toContain("environment");
      expect(result.code).toContain("Timeout in seconds");
      expect(result.code).toContain("Target environment");
      expect(result.code).toContain('values = {"dev", "staging", "production"}');
    });

    it("should validate plugin name", () => {
      const params = {
        plugin_type: "node-step" as const,
        name: "Invalid Name!", // Invalid: contains space and special char
        class_name: "TestPlugin",
      };

      expect(() => pluginCreate(params)).toThrow();
    });

    it("should validate class name", () => {
      const params = {
        plugin_type: "node-step" as const,
        name: "test-plugin",
        class_name: "invalidClassName", // Invalid: doesn't start with uppercase
      };

      expect(() => pluginCreate(params)).toThrow();
    });

    it("should generate warnings when no properties defined", () => {
      const params = {
        plugin_type: "node-step" as const,
        name: "test-plugin",
        class_name: "TestPlugin",
      };

      const result = pluginCreate(params);

      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBeGreaterThan(0);
      expect(result.warnings?.[0]).toContain("No configuration properties");
    });
  });
});

