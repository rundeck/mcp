/**
 * Opt-in OpenTelemetry metrics (OTLP push). No HTTP /metrics listener.
 * Enabled when an OTLP metrics endpoint is configured (see shouldEnableTelemetry).
 */

import { metrics } from "@opentelemetry/api";
import type { CallToolResult, InputRequiredResult } from "@modelcontextprotocol/server";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { USER_AGENT } from "./tools/api.js";
import { logger } from "./utils/logger.js";

const SERVICE_VERSION = USER_AGENT.replace(/^rundeck-mcp\//, "") || "SNAPSHOT";

const TOOLS_HIT_RUNDECK = new Set([
  "api_call",
  "acl_manage",
  "runner_create",
  "resource_model_source_manage",
]);

export type ToolCallOutcome = "success" | "error" | "guidance" | "input_required";

let sdk: NodeSDK | undefined;
let enabled = false;

export function isTelemetryEnabled(): boolean {
  return enabled;
}

export function shouldEnableTelemetry(): boolean {
  if (process.env.OTEL_SDK_DISABLED === "true" || process.env.OTEL_SDK_DISABLED === "1") {
    return false;
  }
  if (process.env.OTEL_METRICS_EXPORTER === "none") {
    return false;
  }
  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim() ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (endpoint) {
    return true;
  }
  return process.env.OTEL_METRICS_EXPORTER === "otlp";
}

export function initTelemetry(): void {
  if (!shouldEnableTelemetry()) {
    return;
  }

  const exportIntervalMs = Number(process.env.OTEL_METRIC_EXPORT_INTERVAL);
  const interval =
    Number.isFinite(exportIntervalMs) && exportIntervalMs > 0 ? exportIntervalMs : 60_000;
  // SDK default exportTimeoutMillis is 30s; interval must be >= timeout or sdk.start() throws.
  const exportTimeoutMillis = Math.min(30_000, interval);

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME?.trim() || "rundeck-mcp",
      [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: interval,
      exportTimeoutMillis,
    }),
  });

  sdk.start();
  enabled = true;
  logger.info(
    "OpenTelemetry metrics export enabled (OTLP gRPC; no /metrics HTTP listener on this process)"
  );
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }
  enabled = false;
  await sdk.shutdown();
  sdk = undefined;
}

function getMeter() {
  return metrics.getMeter("rundeck-mcp", SERVICE_VERSION);
}

let toolCallsCounter: ReturnType<ReturnType<typeof getMeter>["createCounter"]> | undefined;
let toolDurationHistogram:
  | ReturnType<ReturnType<typeof getMeter>["createHistogram"]>
  | undefined;

function toolCalls() {
  if (!toolCallsCounter) {
    toolCallsCounter = getMeter().createCounter("rundeck_mcp_tool_calls", {
      description: "MCP tools/call invocations",
    });
  }
  return toolCallsCounter;
}

function toolDuration() {
  if (!toolDurationHistogram) {
    toolDurationHistogram = getMeter().createHistogram("rundeck_mcp_tool_duration_ms", {
      description: "Wall time for tools/call handler",
      unit: "ms",
    });
  }
  return toolDurationHistogram;
}

export function classifyToolCallOutcome(result: CallToolResult | InputRequiredResult): ToolCallOutcome {
  if (result && typeof result === "object" && "resultType" in result) {
    if ((result as InputRequiredResult).resultType === "input_required") {
      return "input_required";
    }
  }
  const callResult = result as CallToolResult;
  if (callResult.isError) {
    return "error";
  }
  const first = callResult.content?.[0];
  if (first?.type === "text" && typeof first.text === "string") {
    const text = first.text;
    if (text.startsWith("# ") || text.startsWith("# Confirmation")) {
      return "guidance";
    }
  }
  return "success";
}

function recordToolMetrics(tool: string, outcome: ToolCallOutcome, durationMs: number): void {
  if (!enabled) {
    return;
  }
  const attrs = {
    tool,
    outcome,
    rundeck_api: TOOLS_HIT_RUNDECK.has(tool),
  };
  toolCalls().add(1, attrs);
  toolDuration().record(durationMs, attrs);
}

export async function recordToolCall<T extends CallToolResult | InputRequiredResult>(
  tool: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!enabled) {
    return fn();
  }

  const start = performance.now();
  try {
    const result = await fn();
    recordToolMetrics(tool, classifyToolCallOutcome(result), performance.now() - start);
    return result;
  } catch (error) {
    recordToolMetrics(tool, "error", performance.now() - start);
    throw error;
  }
}
