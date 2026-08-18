/**
 * ACL Policy management tools
 *
 * Rundeck ACL Policies are notoriously fiddly to hand-author: a single missing
 * `context`, `by`, or `allow`/`deny` clause silently turns into a REJECTED
 * (i.e. denied) access check with no obvious error at edit time. These tools
 * give the model a structural pre-flight check plus a small, named surface
 * for the CRUD operations Rundeck exposes for ACL policy files, instead of
 * requiring it to hand-build `api_call` requests against `system/acl/*` or
 * `project/{project}/acl/*`.
 */

import { z } from "zod";
import * as yaml from "yaml";
import { rundeckApiCall } from "./api.js";

const KNOWN_FOR_TYPES = [
  "job",
  "node",
  "adhoc",
  "project",
  "resource",
  "storage",
  "project_acl",
  "system_acl",
  "user",
  "runner",
  "apitoken",
  "plugin",
  "event",
  "webhook",
  "system",
];

const MATCH_KEYS = ["match", "equals", "contains", "subset"];

type PolicyScope = "project" | "app";

/**
 * Valid `allow`/`deny` actions for direct `for.<type>` rules, keyed by type then
 * scope (which `context` declares: `project` or `application`). Sourced from
 * Rundeck's AuthResources.java action constants. A type/scope combination that's
 * absent here means we don't have a confirmed action list for it (e.g. it may
 * only be reachable via `resource: kind:`, or only exist in the other scope) —
 * absence is intentional so we never guess and risk a false-positive warning.
 */
const FOR_TYPE_ACTIONS: Partial<Record<string, Partial<Record<PolicyScope, string[]>>>> = {
  adhoc: { project: ["read", "view", "run", "runAs", "kill", "killAs"] },
  job: {
    project: [
      "read", "view", "update", "delete", "run", "runAs", "kill", "killAs",
      "create", "toggle_execution", "toggle_schedule",
      "scm_update", "scm_create", "scm_delete", "view_history",
    ],
  },
  node: { project: ["read", "run"] },
  storage: { project: ["create", "read", "update", "delete"], app: ["create", "read", "update", "delete"] },
  project_acl: { app: ["read", "create", "update", "delete", "admin", "app_admin"] },
  runner: {
    project: ["read", "create", "update", "delete", "ping", "regenerate_credentials"],
    app: ["read", "create", "update", "delete", "ping", "regenerate_credentials"],
  },
  apitoken: { app: ["create"] },
};

/**
 * Valid `allow`/`deny` actions for `resource: - equals: {kind: <kind>}` rules,
 * keyed by kind then scope. Same provenance and absence-is-intentional rule as
 * `FOR_TYPE_ACTIONS` above. `resource` itself (the bare type, no `kind`) has no
 * action vocabulary in Rundeck — it's a container key, not an actionable type.
 */
const RESOURCE_KIND_ACTIONS: Partial<Record<string, Partial<Record<PolicyScope, string[]>>>> = {
  job: { project: ["create", "delete"], app: ["admin", "app_admin", "ops_admin"] },
  node: { project: ["read", "create", "update", "refresh"] },
  project: { app: ["create"] },
  system_acl: { app: ["read", "create", "update", "delete", "admin", "app_admin", "ops_admin"] },
  user: { app: ["admin", "app_admin"] },
  runner: { project: ["read", "admin"], app: ["read", "admin"] },
  apitoken: { app: ["admin", "app_admin", "generate_user_token", "generate_service_token"] },
  plugin: { app: ["read", "install", "uninstall", "admin", "app_admin", "ops_admin"] },
  event: { project: ["read", "create"] },
  webhook: {
    project: ["read", "create", "update", "delete", "admin", "app_admin", "post"],
    app: ["read", "create", "update", "delete", "post", "admin", "app_admin"],
  },
  system: { app: ["read", "enable_executions", "disable_executions", "admin", "app_admin", "ops_admin"] },
};

/** Returns the action list if `value` is a string or an array of strings; null otherwise (including mixed-type arrays). */
function normalizeActions(value: unknown): string[] | null {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((v): v is string => typeof v === "string")) {
    return value;
  }
  return null;
}

/** Best-effort extraction of a rule's `kind` from its match/equals/contains/subset clause. */
function extractKind(rule: Record<string, unknown>): string | undefined {
  for (const key of MATCH_KEYS) {
    const clause = rule[key];
    if (clause && typeof clause === "object" && !Array.isArray(clause)) {
      const kind = (clause as Record<string, unknown>).kind;
      if (typeof kind === "string") return kind;
    }
  }
  return undefined;
}

function checkRuleActions(
  label: string,
  typeName: string,
  ruleIndex: number,
  rule: Record<string, unknown>,
  scope: PolicyScope | undefined,
  warnings: string[]
): void {
  if (!scope) return;

  const kind = typeName === "resource" ? extractKind(rule) : undefined;
  const actionSet =
    typeName === "resource"
      ? (kind ? RESOURCE_KIND_ACTIONS[kind]?.[scope] : undefined)
      : FOR_TYPE_ACTIONS[typeName]?.[scope];
  if (!actionSet) return;

  const subject = typeName === "resource" ? `resource kind '${kind}'` : `'for.${typeName}'`;

  for (const key of ["allow", "deny"] as const) {
    const actions = normalizeActions(rule[key]);
    if (!actions) continue;
    for (const action of actions) {
      if (action === "*") continue;
      if (!actionSet.includes(action)) {
        warnings.push(
          `${label}: 'for.${typeName}[${ruleIndex}].${key}' action '${action}' is not a recognized action for ${subject} in ${scope} scope ` +
          `(known: ${actionSet.join(", ")}). This may be a typo, or valid on newer Rundeck versions.`
        );
      }
    }
  }
}

export interface AclValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  policyCount: number;
}

/**
 * Validate the structure of an ACL Policy YAML document (or multi-document
 * file, separated by `---`) against the aclpolicy v1.0 format. This is a
 * local, offline structural check — it does not guarantee Rundeck's server
 * will accept the policy (only Rundeck itself is authoritative), but it
 * catches the most common authoring mistakes before a create/update call.
 */
export function rundeckValidateAcl(params: {
  acl_definition: string;
}): AclValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let docs: yaml.Document.Parsed[];
  try {
    docs = yaml.parseAllDocuments(params.acl_definition).filter((d) => {
      // Ignore fully blank documents produced by trailing `---` separators.
      return d.contents !== null && d.contents !== undefined;
    });
  } catch (error) {
    errors.push(
      `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`
    );
    return { valid: false, errors, warnings, policyCount: 0 };
  }

  if (docs.length === 0) {
    errors.push("No policy documents found. An .aclpolicy file must contain at least one YAML document.");
    return { valid: false, errors, warnings, policyCount: 0 };
  }

  docs.forEach((doc, index) => {
    const label = docs.length > 1 ? `policy[${index + 1}]` : "policy";

    for (const parseError of doc.errors) {
      errors.push(`${label}: YAML syntax error: ${parseError.message}`);
    }
    if (doc.errors.length > 0) {
      return;
    }

    const policy = doc.toJS();
    if (typeof policy !== "object" || policy === null || Array.isArray(policy)) {
      errors.push(`${label}: must be a YAML mapping (object), not ${Array.isArray(policy) ? "a list" : typeof policy}`);
      return;
    }

    const p = policy as Record<string, unknown>;

    if (!p.description) {
      warnings.push(`${label}: missing 'description' — recommended so the policy is identifiable in rundeck-audit.log`);
    }

    // context
    let scope: PolicyScope | undefined;
    if (!p.context || typeof p.context !== "object") {
      errors.push(`${label}: missing required 'context' section (must declare 'project' or 'application')`);
    } else {
      const context = p.context as Record<string, unknown>;
      const hasProject = context.project !== undefined;
      const hasApplication = context.application !== undefined;
      if (!hasProject && !hasApplication) {
        errors.push(`${label}: 'context' must declare either 'project' (regex) or 'application'`);
      } else if (hasProject && hasApplication) {
        errors.push(`${label}: 'context' must declare only one of 'project' or 'application', not both`);
      } else if (hasApplication && context.application !== "rundeck") {
        errors.push(`${label}: 'context.application' must be 'rundeck', got '${String(context.application)}'`);
      } else if (hasProject && typeof context.project !== "string") {
        errors.push(`${label}: 'context.project' must be a string (regex pattern)`);
      } else {
        scope = hasProject ? "project" : "app";
      }
    }

    // for
    if (!p.for || typeof p.for !== "object" || Array.isArray(p.for)) {
      errors.push(`${label}: missing required 'for' section (declares resource types and rules)`);
    } else {
      const forSection = p.for as Record<string, unknown>;
      const forKeys = Object.keys(forSection);
      if (forKeys.length === 0) {
        errors.push(`${label}: 'for' section is empty — must declare at least one resource type`);
      }

      for (const typeName of forKeys) {
        if (!KNOWN_FOR_TYPES.includes(typeName)) {
          warnings.push(`${label}: 'for.${typeName}' is not a recognized resource type (known: ${KNOWN_FOR_TYPES.join(", ")}). This may be valid on newer Rundeck versions.`);
        }

        const rules = forSection[typeName];
        if (!Array.isArray(rules)) {
          errors.push(`${label}: 'for.${typeName}' must be a sequence of rules`);
          continue;
        }
        if (rules.length === 0) {
          warnings.push(`${label}: 'for.${typeName}' has no rules`);
        }

        rules.forEach((rule, ruleIndex) => {
          if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
            errors.push(`${label}: 'for.${typeName}[${ruleIndex}]' must be a mapping`);
            return;
          }
          const r = rule as Record<string, unknown>;
          if (r.allow === undefined && r.deny === undefined) {
            errors.push(`${label}: 'for.${typeName}[${ruleIndex}]' must declare 'allow' and/or 'deny'`);
          }
          for (const key of ["allow", "deny"] as const) {
            if (r[key] !== undefined && normalizeActions(r[key]) === null) {
              errors.push(`${label}: 'for.${typeName}[${ruleIndex}].${key}' must be a string or a list of strings, got ${Array.isArray(r[key]) ? "a list with non-string entries" : typeof r[key]}`);
            }
          }
          const hasMatch = MATCH_KEYS.some((k) => r[k] !== undefined);
          if (!hasMatch) {
            warnings.push(`${label}: 'for.${typeName}[${ruleIndex}]' has no match/equals/contains/subset clause — it applies to ALL resources of this type`);
          }
          checkRuleActions(label, typeName, ruleIndex, r, scope, warnings);
        });
      }
    }

    // by / notBy
    const hasBy = p.by !== undefined;
    const hasNotBy = p.notBy !== undefined;
    if (!hasBy && !hasNotBy) {
      errors.push(`${label}: missing required 'by' (or 'notBy') section declaring who the policy applies to`);
    }
    if (hasBy) {
      const by = p.by as Record<string, unknown>;
      if (typeof by !== "object" || by === null || (by.username === undefined && by.group === undefined && by.urn === undefined)) {
        errors.push(`${label}: 'by' must declare at least one of 'username', 'group', or 'urn'`);
      }
    }
    if (hasNotBy) {
      const notBy = p.notBy as Record<string, unknown>;
      if (typeof notBy !== "object" || notBy === null || (notBy.username === undefined && notBy.group === undefined && notBy.urn === undefined)) {
        errors.push(`${label}: 'notBy' must declare at least one of 'username', 'group', or 'urn'`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    policyCount: docs.length,
  };
}

export interface AclPolicyResult {
  status: number;
  body: unknown;
}

const ACTION_METHOD: Record<string, string> = {
  list: "GET",
  get: "GET",
  create: "POST",
  update: "PUT",
  delete: "DELETE",
};

const ACTION_SUCCESS_STATUS: Record<string, number> = {
  list: 200,
  get: 200,
  create: 201,
  update: 200,
  delete: 204,
};

function buildAclEndpoint(params: {
  action: string;
  scope: "system" | "project";
  project?: string;
  name?: string;
}): string {
  const base = params.scope === "project" ? `project/${params.project}/acl` : "system/acl";
  if (params.action === "list") {
    return `${base}/`;
  }
  return `${base}/${params.name}`;
}

/**
 * Manage a Rundeck ACL Policy file at system or project scope: list, get,
 * create, update, or delete. Thin wrapper over the `system/acl/*` and
 * `project/{project}/acl/*` REST endpoints — see api/index.md#acls.
 */
export async function rundeckManageAcl(params: {
  action: "list" | "get" | "create" | "update" | "delete";
  scope: "system" | "project";
  project?: string;
  name?: string;
  content?: string;
}): Promise<AclPolicyResult> {
  if (params.scope === "project" && !params.project) {
    throw new Error("'project' is required when scope is 'project'");
  }
  if (params.action !== "list" && !params.name) {
    throw new Error(`'name' is required for action '${params.action}'`);
  }
  if ((params.action === "create" || params.action === "update") && !params.content) {
    throw new Error(`'content' (ACL policy YAML) is required for action '${params.action}'`);
  }

  let name = params.name;
  if (name && !name.endsWith(".aclpolicy")) {
    name = `${name}.aclpolicy`;
  }

  const endpoint = buildAclEndpoint({ ...params, name });
  const method = ACTION_METHOD[params.action];

  const body =
    params.action === "create" || params.action === "update"
      ? { contents: params.content }
      : undefined;

  const result = await rundeckApiCall({ endpoint, method, body });

  const expected = ACTION_SUCCESS_STATUS[params.action];
  if (result.status !== expected) {
    const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
    throw new Error(
      `ACL ${params.action} failed (HTTP ${result.status}, expected ${expected}): ${detail}`
    );
  }

  return { status: result.status, body: result.body };
}

// Zod schemas

export const rundeckValidateAclSchema = z.object({
  acl_definition: z.string().describe(
    "ACL Policy file contents as a YAML string. May contain multiple '---'-separated policy documents. " +
    "Example: 'description: Admin\\ncontext:\\n  application: rundeck\\nfor:\\n  resource:\\n    - equals:\\n        kind: system\\n      allow: [read, admin]\\nby:\\n  group: admin'"
  ),
});

export const rundeckManageAclSchema = z
  .object({
    action: z.enum(["list", "get", "create", "update", "delete"]).describe(
      "Operation to perform.\n" +
      "- 'list': list ACL policy files in scope (GET .../acl/)\n" +
      "- 'get': fetch one policy's YAML contents (GET .../acl/{name})\n" +
      "- 'create': create a new policy (POST .../acl/{name}) — requires 'content'\n" +
      "- 'update': replace an existing policy (PUT .../acl/{name}) — requires 'content'\n" +
      "- 'delete': remove a policy (DELETE .../acl/{name})"
    ),
    scope: z.enum(["system", "project"]).describe(
      "Policy scope.\n" +
      "- 'system': stored ACL policies at system/acl/* — apply cluster/instance-wide.\n" +
      "- 'project': stored ACL policies at project/{project}/acl/* — apply to one project only. Requires 'project'."
    ),
    project: z.string().optional().describe(
      "Project name — required when scope is 'project'. Example: 'my-project'"
    ),
    name: z.string().optional().describe(
      "ACL policy file name. The '.aclpolicy' suffix is added automatically if omitted. " +
      "Required for all actions except 'list'. Example: 'admin' or 'admin.aclpolicy'"
    ),
    content: z.string().optional().describe(
      "ACL policy YAML contents. Required for 'create' and 'update'. " +
      "Strongly recommended: validate with acl_validate before submitting — Rundeck will reject invalid policies with a 400 " +
      "and a list of per-document errors, but a local check surfaces the same issues faster."
    ),
    confirm: z.boolean().optional().default(false).describe(
      "Fallback only. When the connected client supports MCP elicitation, the server prompts the " +
      "user directly and this field is unused — but if that prompt isn't available or fails, this " +
      "is required when action is 'delete' or 'update' — both mutate or remove the policy " +
      "irreversibly: must be explicitly set to true, and only after the user has explicitly " +
      "approved that specific change — never inferred or defaulted to true on the agent's own " +
      "judgment. Ignored for 'list', 'get', and 'create'."
    ),
  })
  .refine((s) => s.scope !== "project" || s.project !== undefined, {
    message: "'project' is required when scope is 'project'",
    path: ["project"],
  })
  .refine((s) => s.action === "list" || s.name !== undefined, {
    message: "'name' is required for all actions except 'list'",
    path: ["name"],
  })
  .refine((s) => (s.action !== "create" && s.action !== "update") || s.content !== undefined, {
    message: "'content' is required for 'create' and 'update' actions",
    path: ["content"],
  });