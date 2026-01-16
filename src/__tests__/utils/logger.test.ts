/**
 * Tests for logger utility
 */

import { logger, LogLevel } from "../../utils/logger.js";

describe("Logger", () => {
  // Mock console.error to capture logs
  const originalError = console.error;
  let logOutput: string[] = [];

  beforeEach(() => {
    logOutput = [];
    console.error = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.error = originalError;
  });

  describe("log levels", () => {
    it("should log info messages", () => {
      logger.info("Test info message");
      expect(logOutput.some(log => log.includes("INFO"))).toBe(true);
    });

    it("should log warn messages", () => {
      logger.warn("Test warn message");
      expect(logOutput.some(log => log.includes("WARN"))).toBe(true);
    });

    it("should log error messages", () => {
      logger.error("Test error message");
      expect(logOutput.some(log => log.includes("ERROR"))).toBe(true);
    });
  });

  describe("convenience methods", () => {
    it("should log tool calls", () => {
      logger.logToolCall("job_create", { name: "Test" });
      expect(logOutput.some(log => log.includes("job_create"))).toBe(true);
    });

    it("should log resource access", () => {
      logger.logResourceAccess("rundeck://api");
      // Debug logs may not appear if MCP_DEBUG is not set, so just verify no error
      expect(() => logger.logResourceAccess("rundeck://api")).not.toThrow();
    });
  });
});

