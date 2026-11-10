import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  classifyToolCallOutcome,
  initTelemetry,
  isTelemetryEnabled,
  recordToolCall,
  shouldEnableTelemetry,
  shutdownTelemetry,
} from "../../telemetry.js";

describe("telemetry", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
    delete process.env.OTEL_METRICS_EXPORTER;
  });

  afterEach(async () => {
    await shutdownTelemetry();
    process.env = envSnapshot;
  });

  it("shouldEnableTelemetry is false without OTLP endpoint", () => {
    expect(shouldEnableTelemetry()).toBe(false);
  });

  it("shouldEnableTelemetry is true when OTLP endpoint is set", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4317";
    expect(shouldEnableTelemetry()).toBe(true);
  });

  it("initTelemetry stays off when disabled", () => {
    initTelemetry();
    expect(isTelemetryEnabled()).toBe(false);
  });

  it("initTelemetry does not throw when export interval is below SDK default timeout", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:4317";
    process.env.OTEL_METRIC_EXPORT_INTERVAL = "10000";
    expect(() => initTelemetry()).not.toThrow();
    expect(isTelemetryEnabled()).toBe(true);
  });

  it("classifyToolCallOutcome detects error, guidance, and success", () => {
    expect(
      classifyToolCallOutcome({
        content: [{ type: "text", text: "Error executing tool" }],
        isError: true,
      }),
    ).toBe("error");

    expect(
      classifyToolCallOutcome({
        content: [{ type: "text", text: "# API Call Guidance\n\nSteps..." }],
      }),
    ).toBe("guidance");

    expect(
      classifyToolCallOutcome({
        content: [{ type: "text", text: '{"status":200}' }],
      }),
    ).toBe("success");

    expect(
      classifyToolCallOutcome({
        resultType: "input_required",
      } as unknown as import("@modelcontextprotocol/server").InputRequiredResult),
    ).toBe("input_required");
  });

  it("recordToolCall passes through when telemetry is off", async () => {
    const result = await recordToolCall("api_list", async () => ({
      content: [{ type: "text", text: "ok" }],
    }));
    expect(result.content[0].text).toBe("ok");
  });
});
