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
];

const MATCH_KEYS = ["match", "equals", "contains", "subset"];

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
          const hasMatch = MATCH_KEYS.some((k) => r[k] !== undefined);
          if (!hasMatch) {
            warnings.push(`${label}: 'for.${typeName}[${ruleIndex}]' has no match/equals/contains/subset clause — it applies to ALL resources of this type`);
          }
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