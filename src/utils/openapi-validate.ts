/**
 * Validate api_call inputs against the generated OpenAPI spec shipped with Rundeck docs.
 * Guards obvious typos in query strings and JSON body keys before HTTP is sent.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as yaml from "yaml";

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

interface OasParameter {
  name: string;
  in: string;
  required?: boolean;
}

interface ContentBlock {
  schema?: Record<string, unknown>;
  examples?: Record<string, { value?: unknown }>;
  example?: unknown;
}

let cachedFilePath = "";
let cachedDoc: Record<string, unknown> | null = null;

/** For tests — forces reload after changing files (not typical in production). */
export function resetOpenApiCache(): void {
  cachedFilePath = "";
  cachedDoc = null;
}

export function resolveOpenApiPath(docsPath: string): string | null {
  const candidates = [
    join(docsPath, ".vuepress", "public", "files", "rundeck-api.yml"),
    join(docsPath, ".vuepress", "public", "files", "rundeck-api.yaml"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }
  return null;
}

export function loadOpenApiDocument(docsPath: string): Record<string, unknown> | null {
  const resolved = resolveOpenApiPath(docsPath);
  if (!resolved) {
    return null;
  }
  if (cachedDoc && cachedFilePath === resolved) {
    return cachedDoc;
  }
  try {
    const raw = readFileSync(resolved, "utf8");
    cachedDoc = yaml.parse(raw) as Record<string, unknown>;
    cachedFilePath = resolved;
    return cachedDoc;
  } catch {
    return null;
  }
}

/** Turn user endpoint input into OpenAPI-relative path (/projects, /job/…/run). */
export function normalizeEndpointToOpenApiPath(endpoint: string): string {
  let e = endpoint.trim();
  if (!e) {
    return "/";
  }
  try {
    if (e.startsWith("http://") || e.startsWith("https://")) {
      e = new URL(e).pathname;
    }
  } catch {
    // keep as-is
  }
  e = e.replace(/^\/api\/[^/]+(?=\/|$)/, "") || "";
  if (e === "") {
    return "/";
  }
  if (!e.startsWith("/")) {
    e = `/${e}`;
  }
  if (e.length > 1 && e.endsWith("/")) {
    e = e.slice(0, -1);
  }
  return e;
}

function segments(p: string): string[] {
  return p.split("/").filter(Boolean);
}

export function templateMatches(template: string, concrete: string): boolean {
  const t = segments(template.startsWith("/") ? template : `/${template}`);
  const c = segments(concrete.startsWith("/") ? concrete : `/${concrete}`);
  if (t.length !== c.length) {
    return false;
  }
  for (let i = 0; i < t.length; i++) {
    const ts = t[i];
    const cs = c[i];
    if (ts.startsWith("{") && ts.endsWith("}")) {
      continue;
    }
    if (ts !== cs) {
      return false;
    }
  }
  return true;
}

export function findOpenApiOperation(
  doc: Record<string, unknown>,
  methodUpper: string,
  normalizedPath: string
): {
  operation: Record<string, unknown>;
  pathTemplate: string;
} | null {
  const paths = doc.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths || typeof paths !== "object") {
    return null;
  }
  const http = methodUpper.toLowerCase();

  let bestTemplate: string | null = null;
  let bestOp: Record<string, unknown> | null = null;
  let bestLen = -1;

  for (const templateRaw of Object.keys(paths)) {
    const templatePath = templateRaw.startsWith("/") ? templateRaw : `/${templateRaw}`;
    if (!templateMatches(templatePath, normalizedPath)) {
      continue;
    }
    const pathItem = paths[templateRaw];
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }
    const op = pathItem[http];
    if (!op || typeof op !== "object") {
      continue;
    }
    const pathItemParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    const opParams = Array.isArray((op as Record<string, unknown>).parameters)
      ? ((op as Record<string, unknown>).parameters as unknown[])
      : [];
    const mergedOp: Record<string, unknown> = {
      ...(op as Record<string, unknown>),
      parameters: [...pathItemParams, ...opParams],
    };
    const len = segments(templatePath).length;
    if (len > bestLen) {
      bestLen = len;
      bestTemplate = templatePath;
      bestOp = mergedOp;
    }
  }

  if (!bestOp || bestTemplate === null) {
    return null;
  }
  return {
    operation: bestOp,
    pathTemplate: bestTemplate,
  };
}

function resolveRef(doc: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    return undefined;
  }
  const bits = ref.slice(2).split("/");
  let cur: unknown = doc;
  for (const b of bits) {
    if (!cur || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[b];
  }
  return cur;
}

function collectBodyKeysFromSchema(doc: Record<string, unknown>, schema: unknown, depth = 0): Set<string> {
  const keys = new Set<string>();

  function visit(s: unknown, d: number): void {
    if (!s || typeof s !== "object" || d > 14) {
      return;
    }
    const obj = s as Record<string, unknown>;
    if (typeof obj.$ref === "string") {
      visit(resolveRef(doc, obj.$ref), d + 1);
      return;
    }
    if (Array.isArray(obj.allOf)) {
      for (const part of obj.allOf) {
        visit(part, d + 1);
      }
    }
    if (obj.properties && typeof obj.properties === "object") {
      for (const k of Object.keys(obj.properties as Record<string, unknown>)) {
        keys.add(k);
      }
    }
  }

  visit(schema, depth);
  return keys;
}

function collectExamplesBodyKeys(content: Record<string, ContentBlock>): Set<string> | null {
  const json = content["application/json"];
  if (!json) {
    return null;
  }
  const keys = new Set<string>();
  if (json.examples && typeof json.examples === "object") {
    for (const ex of Object.values(json.examples)) {
      const v = ex?.value;
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        for (const k of Object.keys(v as Record<string, unknown>)) {
          keys.add(k);
        }
      }
    }
  }
  if (
    json.example !== undefined &&
    typeof json.example === "object" &&
    json.example !== null &&
    !Array.isArray(json.example)
  ) {
    for (const k of Object.keys(json.example as Record<string, unknown>)) {
      keys.add(k);
    }
  }
  return keys.size > 0 ? keys : null;
}

function queryParamNameAllowed(declaredName: string, actualKey: string): boolean {
  if (declaredName === actualKey) {
    return true;
  }
  const d = declaredName.toLowerCase();
  if (
    (d.includes("option") && d.includes("optname")) ||
    /^option\.optname$/i.test(declaredName)
  ) {
    return /^option\.[a-zA-Z0-9_.-]+$/.test(actualKey);
  }
  if (
    (d.includes("meta") && d.includes("key")) ||
    /^meta\.key$/i.test(declaredName) ||
    declaredName.includes("meta.KEY")
  ) {
    return /^meta\.[a-zA-Z0-9_.-]+$/.test(actualKey);
  }
  return false;
}

function validateQueryKeys(
  parameters: unknown,
  queryParams: Record<string, string | undefined>
): string | undefined {
  const provided = Object.keys(queryParams).filter(
    (k) => queryParams[k] !== undefined && queryParams[k] !== ""
  );

  if (!parameters || !Array.isArray(parameters)) {
    if (provided.length > 0) {
      return (
        `Unknown query parameter(s): ${provided.join(", ")}. ` +
        "This operation has no documented query parameters in the OpenAPI spec."
      );
    }
    return undefined;
  }

  const paramList = parameters as OasParameter[];
  const queryDecl = paramList.filter((p) => p && typeof p.name === "string" && p.in === "query");

  if (queryDecl.length === 0 && provided.length > 0) {
    return (
      `Unknown query parameter(s): ${provided.join(", ")}. ` +
      "This operation declares no supported query parameters in the OpenAPI spec."
    );
  }

  for (const key of provided) {
    let allowed = false;
    for (const p of queryDecl) {
      if (queryParamNameAllowed(p.name, key)) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      const known = queryDecl.map((p) => p.name).filter(Boolean);
      return (
        `Unknown query parameter '${key}'. ` +
        (known.length
          ? `Declared for this operation: ${known.join(", ")}, plus patterns option.* and meta.* where documented.`
          : "This operation declares no documented query parameters.")
      );
    }
  }

  for (const p of queryDecl) {
    if (!p.required || queryParamNameAllowed(p.name, p.name)) {
      continue;
    }
    if (queryParams[p.name] === undefined || queryParams[p.name] === "") {
      return `Missing required query parameter '${p.name}' for this endpoint.`;
    }
  }

  return undefined;
}

function derefMaybe<T extends Record<string, unknown>>(doc: Record<string, unknown>, obj: T | undefined): T | undefined {
  if (!obj) {
    return undefined;
  }
  if (typeof obj.$ref === "string") {
    const r = resolveRef(doc, obj.$ref);
    if (r && typeof r === "object") {
      return r as T;
    }
    return undefined;
  }
  return obj;
}

export function validateOpenApiRequest(
  doc: Record<string, unknown>,
  params: {
    method: string;
    endpoint: string;
    query_params?: Record<string, string>;
    body?: unknown;
  }
): ValidationResult {
  const normalized = normalizeEndpointToOpenApiPath(params.endpoint);
  const found = findOpenApiOperation(doc, params.method || "GET", normalized);
  if (!found) {
    return { ok: true };
  }

  const { operation } = found;
  const parameters = operation.parameters;
  const q = params.query_params || {};
  const qErr = validateQueryKeys(parameters, q);
  if (qErr) {
    return { ok: false, message: qErr };
  }

  const m = (params.method || "GET").toUpperCase();
  if (m === "GET" || m === "DELETE" || m === "HEAD") {
    return { ok: true };
  }

  const bodyObj =
    params.body !== undefined &&
    typeof params.body === "object" &&
    params.body !== null &&
    !Array.isArray(params.body)
      ? (params.body as Record<string, unknown>)
      : undefined;

  if (!bodyObj) {
    return { ok: true };
  }

  let rbRaw = operation.requestBody as Record<string, unknown> | undefined;
  rbRaw = derefMaybe(doc, rbRaw);

  if (!rbRaw || typeof rbRaw !== "object") {
    return { ok: true };
  }

  const content = rbRaw.content as Record<string, ContentBlock> | undefined;
  if (!content?.["application/json"]) {
    return { ok: true };
  }

  const jsonBlock = content["application/json"];
  const schemaRaw = jsonBlock.schema && typeof jsonBlock.schema === "object"
    ? (jsonBlock.schema as Record<string, unknown>)
    : undefined;

  const fromSchema = collectBodyKeysFromSchema(doc, schemaRaw);
  if (fromSchema.size === 0) {
    return { ok: true };
  }

  const allowedSet = new Set<string>(fromSchema);
  const fromExamples = collectExamplesBodyKeys(content);
  fromExamples?.forEach((k) => allowedSet.add(k));

  const schemaDeref =
    typeof schemaRaw?.$ref === "string"
      ? (resolveRef(doc, schemaRaw.$ref) as Record<string, unknown> | undefined)
      : schemaRaw;

  const additional =
    typeof schemaDeref?.additionalProperties === "boolean"
      ? schemaDeref.additionalProperties === true
      : typeof schemaDeref?.additionalProperties === "object"
        ? true
        : undefined;

  if (additional === true) {
    return { ok: true };
  }

  const seen = Object.keys(bodyObj);
  const bad = seen.filter((k) => !allowedSet.has(k));
  if (bad.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    message:
      `Unknown JSON body field(s): ${bad.join(", ")}. ` +
      `Allowed top-level keys for this operation include: ${[...allowedSet].sort().join(", ")}.`,
  };
}
