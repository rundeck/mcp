# SPEC: agent-runner-tools - MCP tools for using Rundeck as a runner for AI agents

## Objective
Let an AI agent (claude.ai, Claude Code, Cursor) connected to the MCP do two things on an environment:
- **Diagnose** with read-only ad-hoc commands on a Runner.
- **Remediate** with Rundeck jobs that require approval.

The agent never makes changes outside a job. Reference design: [Rundeck as a Runner for AI Agents](https://claude.ai/artifact/5SUK2D6vr9MuJ8aYp9FmZL).

## Design principle
- **Diagnostics = ad-hoc commands built by the LLM.** CLIs such as kubectl, aws, docker, docker compose and gh are huge and change over time. The LLM already knows them, so there is no job per command.
  - It is acceptable for the exact command to vary between reads.
  - What is required is transparency: the exact command that ran is returned to the agent and recorded in Rundeck's audit trail.
- **Remediation = a small set of fixed, reviewed jobs** (restart, scale, rollback). They change the environment and require approval.
- **The real control is the Runner's read-only credentials,** not how many commands the MCP recognizes.

## Context and current state
- **Already implemented:**
  - Tools `api_call`, `api_list`, `job_create`, `job_validate`, `runner_create`, `acl_*`, `resource_model_source_manage`, `rundeck_connect` and `docs_search`.
  - Dispatch happens in the `switch` in `src/create-server.ts`.
  - `api_call` already classifies `DELETE` and `POST .../regenerateCreds` calls as destructive (`isRunnerCredentialRegenerationEndpoint` in `src/tools/api.ts`) and gates them with elicitation (`requestDestructiveConfirmation` in `src/utils/confirmation.ts`).
- **Already on branch `feature/agent-runner-tools` (not on `main`):**
  - The HTTP transport.
  - `jwt_bearer` mode.
  - The OAuth proxy with DCR (`src/http/mcp-oauth.ts`).
- **A draft of `src/utils/readonly-commands.ts` exists**; it must be checked against section 6.
- **Does not exist yet:**
  - Catalog tools.
  - Ad-hoc execution with controls.
  - Token signature and audience validation (see `agent-runner-oauth.md`).
  - A deployment profile that disables `api_call`.

## Scope

### 1. `agent-runner` deployment profile
- New variable `MCP_TOOL_PROFILE` with two values:
  - `full`: today's behavior.
  - `agent-runner`: `ListTools` and `CallTool` expose only `project_catalog`, `rundeck_catalog`, `target_resolve`, `job_describe`, `job_run`, `execution_output`, `run_adhoc`, `docs_search` and `rundeck_connect` (the last one only when `RUNDECK_INSTANCES` is set).
- Under `agent-runner`, `api_call` and every admin tool (`acl_manage`, `job_create`, `runner_create`, `resource_model_source_manage`) are hidden, and calling them returns an error. If `api_call` were exposed, everything below could be bypassed.
- Over the HTTP transport, the default profile is `agent-runner` (fail closed). Running `full` over HTTP requires setting it explicitly.
- The filter applies in `ListTools` **and** in `CallTool` dispatch. Resources and prompts that write are also excluded from the profile.
- The tool list lives in `src/tools/registered-tool-names.ts`; the filter is applied in one place in `create-server.ts`.
- `rundeck_connect` may only switch between `RUNDECK_INSTANCES` entries that have Runners configured for `run_adhoc`; otherwise it is excluded from the profile.

### 2. `rundeck_catalog` (jobs)
- Input: `{ project?: string, query?: string }`.
- Calls `GET /projects` and then `GET /project/{p}/jobs` with the user's token, so the result already respects their ACL.
- Output: `[{ id, project, group, name, description, needsApproval }]`.
  - `needsApproval` comes from the section 5 rule. Until that rule exists, it is `unknown`, not `false`.
- Paginates per project and caps the number of results, with a notice when the list is cut.
- Descriptions are truncated to 300 characters, stripped of control and zero-width characters, and returned in structured fields marked as third-party data, never mixed with instructions.
- Also exposed as the `rundeck://catalog` resource.

### 2b. `project_catalog`
- Lists the projects that exist, so the LLM knows which one to propose to the user when asked to run a command.
- Input: `{ query?: string }`.
- Calls `GET /projects` with the user's token, so it respects their ACL.
- Output: `[{ name, label, description }]`, using fields every Rundeck project already has. No new configuration is needed.
- The LLM uses `label` and `description` to pick candidates (for example "Kubernetes RBA Staging" for a request about a client namespace) and proposes them to the user. With several candidates it asks; it never picks silently.
- Convention: the project description says what the project operates (environment, cluster, kind of resources) in one or two sentences.
- Descriptions are written by third parties, so they are truncated and treated as data.
- The richer project directory (the `rundeck-mcp` block in the README, section 7) is optional and can be added later if the description is not enough.

### 3. `job_describe`
- Input: `{ job_id: string }`.
- Calls `GET /job/{id}` (definition) and returns the options: name, required, allowed values and whether they are enforced, regex, default.
- `secure` options are flagged as such and never show their value.
- Never shows `valuesUrl` or remote option values (`remoteUrl`), to avoid SSRF and information leaks.

### 4. `job_run` and `execution_output`
- `job_run`: input `{ job_id: string, options: Record<string,string> }`.
  - Validates the options against the definition **before** calling Rundeck: required, enforced values and regex.
  - Rejects unknown option names and never forwards `filter` (node override), `asUser`, `argString` or `runAtTime`.
  - Evaluates option regexes with a timeout or RE2, because JS semantics differ from Java and there is a ReDoS risk.
  - Calls `POST /job/{id}/run` and returns `{ execution_id, permalink }`.
- `execution_output`: input `{ execution_id: string, wait_seconds?: number }`, with a 60-second maximum.
  - Calls `GET /execution/{id}/state` and `GET /execution/{id}/output`, and waits until the timeout.
  - Uses `lastlines`/`maxlines` instead of downloading the full output on every call.
  - The output is truncated (last N lines) and passed through the secret redactor.
  - Asking for another user's execution, such as the approver's, returns whatever the caller's ACL allows.
- Minimum redactor patterns: AWS keys (`AKIA…`), JWTs, PEM blocks, `Authorization: Bearer`, GitHub tokens (`ghp_`, `gho_`, `github_pat_`), k8s ServiceAccount tokens, and base64 blobs in `data:` fields.

### 5. Risk by job group (desired; can wait for a second phase)
- New variable `MCP_JOB_RISK_RULES` as JSON, for example `{"read":["checks/*"],"approval":["ops/*","deploy/*"]}`.
- The rule matches the job's `group/name`. A job that matches no rule is treated as `approval`.
- `job_run` on an `approval` job does not run that job. It looks up `<group>/<name>-request` in the same project and runs that instead.
  - If the `-request` job does not exist, it returns an error.
  - It returns the request's `execution_id` and a message saying the change is pending approval.
- The approval itself (a notification plugin to Slack, WhatsApp or email, and the four-eyes checks) lives on the Rundeck side and is **out of scope for this spec**.
- **The guarantee lives in Rundeck's ACL, not in the MCP.** The `-request` convention can be spoofed: anyone who can create or rename jobs can put anything at `ops/x-request`. So the agent's identity has `run` only on `checks/*` and `*/*-request`, with `run` explicitly denied on everything else. The MCP's risk mapping is only a UX aid.

### 6. `run_adhoc` (read-only diagnostics)
- Input: `{ project: string, tool: "kubectl"|"aws"|"docker"|"gh", args: string[], runner?: string }`.
  - `args` has 1 to 30 elements. A command string is never accepted.
  - `runner` is optional and must be a name from the project's allowed list (see "Runner selection"). The agent never passes a free-form `node_filter`.
- **Classifier** in `src/utils/readonly-commands.ts`: a pure function `classifyCommand(tool, args): { allowed: boolean, reason?: string }`.
- **Classifier strategy (decided): a strict allowlist that denies by default.**
  - Only known combinations of tool, verb and flags pass. Anything new or unknown is rejected until it is added to the list.
  - The lists live in data (one file per tool, for example `src/utils/readonly-commands/kubectl.ts`), separate from the logic, with table tests. Adding a verb is a small, reviewable change.
  - Maintenance: review the lists when CLI versions on the Runners are upgraded.
- **Allowed verbs:** `kubectl get|describe|logs|top|events|explain|api-resources|version`, `aws <service> describe-*|list-*|get-*` (with the exclusions below), `docker ps|logs|images`, `gh pr|issue|run view|list`, and `gh api` with GET only.
- **Flags and values the allowlist must not admit:**
  - Every `=`-joined form of a denied flag (`--raw=`, `--server=`, `--kubeconfig=`), and `file://`, `fileb://` and `@file` values.
  - **kubectl:** only `-n`, `-o` (limited to `wide|name|json|yaml`), `-l`, `--tail` and `--since` are allowed. Denied: `--kubeconfig`, `--token`, `--server`/`-s`, `--raw`, `--context`, `--cluster`, `--user`, `--as*`, `--certificate-authority`, `--insecure-skip-tls-verify`, `-o jsonpath|go-template`, `--watch`/`-w`, `-f`/`--follow`, plugins (an `args[0]` not in the exact list), and any form of `secret` (`Secret`, `secrets`, `secret/x`, `secrets.v1`, `secret.`, `all`). The verb is found even when global flags come first (`-n x delete`).
  - **aws:** denied: `--cli-input-json`, `--cli-input-yaml`, `--endpoint-url`, `--profile`, `aws configure`, `aws s3 cp|sync|mv|rm`, and `get-*` calls that mint credentials (`sts get-session-token|get-federation-token`, `ecr get-login-password`, `codeartifact get-authorization-token`, `rds generate-db-auth-token`, `eks get-token`) or return secrets (`ssm get-parameter*`, `secretsmanager get-secret-value`, `lambda get-function`).
  - **docker:** denied: `-H`/`--host`, `--context`, `--config`, `logs -f`, and `inspect` (it shows environment variables that hold secrets).
  - **gh:** in `gh api`, denied: `-f`, `-F`, `--field`, `--raw-field` and `--input` (they switch the method to POST), `graphql`, `--hostname`, and `-X`/`--method` other than GET. Also denied: `gh extension`, `gh run download`, `gh run view --log`, `gh pr checkout` and `gh auth`.
  - Commands that never end (`--watch`, `-f`) are rejected so they don't hang executions.
- **Execution: ad-hoc directly in Rundeck, targeting a Runner.**
  - `POST /project/{p}/run/command` with the node filter the MCP builds for the chosen Runner. The agent does not control it.
  - Ad-hoc goes through the node's shell, so the MCP builds the `exec` string from the validated array: each argument is shell-quoted, and any argument with shell metacharacters (`;`, `|`, `&`, `$`, backticks, `>`, `<`, newlines) is rejected.
- **Response:** `{ execution_id, command }`, where `command` is the exact string Rundeck ran, so the LLM can quote it verbatim. The output is read with `execution_output`.
- **Errors that guide the LLM:**
  - When the classifier rejects a command, the error says why and what the alternative is. For example: "`rollout restart` is a remediation: use `job_run` with `ops/k8s-rollout-restart`", or "pipes are not allowed: use `-l` or `--field-selector` instead of `grep`".
  - The CLI's own errors (for example a flag that doesn't exist in that version) are returned as-is, so the LLM can correct itself on the next attempt.
- **CLI versions per Runner:** `rundeck_catalog` and `target_resolve` report which tools and versions each Runner has (for example `kubectl v1.30`, `aws-cli 2.x`, `docker compose v2`), so the LLM matches the syntax to what is installed. Source: the Runner node's attributes in Rundeck, or a cached `--version`.
- **Runner environment:** the command runs by the binary's absolute path, without variables that change the target or the credential (`KUBECONFIG`, `AWS_PROFILE`, `AWS_ENDPOINT_URL`, `DOCKER_HOST`, `GH_HOST`, `GH_TOKEN`). This is configured on the Runner; the MCP does not control it.
- **Runner selection (still to be designed).** How the MCP, or the LLM, knows which Runner to run against. Proposal: reuse the *Primary Project Runner* idea from [Job Runner Association Design](https://docs.google.com/document/d/118v534BBA_jYd-kp8SsSZFnCxUinYRwk2cnPsVvTcBE/edit): a default Runner per project for workflow steps.
  - By default, `run_adhoc` runs on the project's default Runner, if Rundeck exposes one.
  - If it doesn't, the MCP uses a config map, for example `MCP_ADHOC_RUNNERS={"k8s-platform":{"default":"runner-prod-ro","allowed":["runner-prod-ro","runner-stg-ro"]}}`.
  - The agent may pick another Runner only from `allowed`, for the one-cluster-per-Runner case.
  - A project with no Runner configured has `run_adhoc` disabled.
  - `rundeck_catalog` lists the allowed Runners per project, so the agent knows where to point.
- **Known gap:** the classifier is an aid, not the security control. The real control is the read-only credentials on the Runner: a Kubernetes `view` ClusterRole, AWS `ViewOnlyAccess`, a GET-only Docker socket proxy, and a read-only GitHub token. Rundeck cannot tell a destructive command from a read command.

### 7. Project directory and target resolution
When the user says "show me the status of deployment `xxx`", the LLM has to know which project, Runner, cluster and namespace that deployment lives in. This section defines how it resolves that. The LLM proposes a target; it never guesses silently.

- **Project directory.** Each Rundeck project describes what it operates:
  - Environments (`prod`, `staging`), clusters, namespaces or tenant patterns, known services and deployments, and the default Runner.
  - **Rundeck already has the fields; what's missing is a convention for using them.** Existing fields: project label and description; the project README in markdown (`GET/PUT /project/{p}/readme.md`); the job description, whose first line is the short description and the rest the extended description in markdown; option descriptions in markdown; job groups; node attributes and tags.
  - **Proposed convention (documentation for teams that write jobs):**
    - The job's first line states its intent in one sentence ("Pods status for a tenant namespace").
    - The extended description says what it does, which options it expects, and its risk.
    - The project README carries a structured block the MCP parses as the directory, for example a ` ```rundeck-mcp ` fence with YAML that declares environments, clusters, what a "client" is (namespace or label) and the default Runner. The rest of the README stays for humans.
    - Runner node attributes declare the CLIs and their versions (`cli.kubectl=1.30`).
  - All of this text is written by third parties: it is treated as data, never as instructions (see section 2).
  - Alternative source: the project's own properties in Rundeck (for example `project.mcp.environments`, `project.mcp.clusters`, `project.mcp.namespaces`, `project.mcp.services`), read with `GET /project/{p}/config` using the user's token, so the ACL applies.
  - Fallback: a map in the MCP, `MCP_PROJECT_DIRECTORY` (JSON or a file), with the same shape.
  - Exposed as the `rundeck://projects` resource and inside `rundeck_catalog`.
- **New tool `target_resolve`.**
  - Input: `{ text?: string, kind?: "deployment"|"namespace"|"service"|"cluster", name?: string, environment?: string }`.
  - Searches the directory and returns ranked candidates: `[{ project, runner, cluster, namespace, environment, match: "exact"|"pattern"|"partial", source: "directory"|"discovery" }]`.
  - **Optional discovery:** if the directory isn't enough, it runs a read-only search with `run_adhoc` on the allowed Runners (for example `kubectl get deploy -A --field-selector metadata.name=xxx`). It uses read verbs only and returns what it finds as candidates with `source: "discovery"`.
- **Rule for the LLM** (in the server's `instructions` and in the tool description):
  - Before `run_adhoc` or `job_run`, if the target isn't explicit, call `target_resolve`.
  - With a single `exact` candidate, it may go ahead with diagnostics and must say which target it used ("deployment `xxx` in `k8s-platform` / `prod-us` / `tenant-x`").
  - With several candidates, or none exact, it proposes the options and asks the user. It does not pick.
  - For remediation (`job_run` on a job that needs approval), it always confirms the target with the user, even with a single candidate. The approval request also shows the resolved target.
- **Default environment:** if the user names no environment and there are candidates in `prod` and elsewhere, the lower-risk one is shown first and the agent asks. `prod` is never assumed for remediation.

## Out of scope
- The Rundeck approval plugin, the `*-request` jobs and the four-eyes checks.
- Everything about OAuth and token validation: see `agent-runner-oauth.md`.
- Installing and credentialing the Runners.

## Acceptance criteria
- [ ] With `MCP_TOOL_PROFILE=agent-runner`, `ListTools` includes neither `api_call` nor admin tools, and calling them returns an error.
- [ ] Over HTTP with no `MCP_TOOL_PROFILE` set, the active profile is `agent-runner`.
- [ ] `project_catalog` returns `name`, `label` and `description` for the projects visible to the token, and doesn't list the ones the ACL hides.
- [ ] `rundeck_catalog` with a token that has no access to a project doesn't list that project.
- [ ] `job_run` rejects options that fail the regex or enforced values, without calling Rundeck.
- [ ] `job_run` rejects an unknown option and never forwards `filter` or `asUser`.
- [ ] With `MCP_JOB_RISK_RULES`, `job_run` on `ops/x` runs `ops/x-request`. If `-request` doesn't exist, it returns an error without running `ops/x`.
- [ ] With the agent's token, a direct `POST /job/{id}/run` on an `ops/*` job (not `-request`) returns 403.
- [ ] `classifyCommand` allows `kubectl get pods -n x` and rejects `kubectl delete pod x`, `kubectl get secrets`, `kubectl get secret/x`, `kubectl -s https://evil get pods`, `aws ec2 terminate-instances`, `aws secretsmanager get-secret-value` and `gh api -X DELETE /repos/x`.
- [ ] `classifyCommand` also rejects `gh api /repos/x/issues -f title=y`, `kubectl get --raw=/api`, `kubectl -n x delete pod y`, `aws sts get-session-token`, `aws s3 cp`, `aws ec2 describe-instances --cli-input-json file://x`, `docker -H tcp://x ps` and `kubectl logs -f x`.
- [ ] `classifyCommand` rejects any unknown verb.
- [ ] `run_adhoc` in a project with no Runner configured says it is disabled; a `runner` outside `allowed` is rejected; an argument with `;`, `|` or `$(` is rejected before calling Rundeck.
- [ ] `run_adhoc` returns the exact `command` Rundeck ran.
- [ ] `execution_output` truncates the output and redacts known secret patterns.
- [ ] Integration test of the real control: with the Runner's credentials, `kubectl delete`, `aws ec2 terminate-instances` and `gh api -f` return 403/AccessDenied even when run directly, without going through the MCP.
- [ ] With two projects that both have a deployment `xxx` (for example `staging` and `prod`), "status of deployment xxx" makes the LLM propose both and ask, without running anything.
- [ ] With a single exact candidate, the diagnostics run and report the project, Runner, cluster and namespace used.
- [ ] A remediation `job_run` without a target confirmed by the user does not run, even when `target_resolve` returns a single candidate.
- [ ] `target_resolve` with a token that has no access to a project returns no candidates from that project.
- [ ] Discovery only runs commands that `classifyCommand` allows.
- [ ] Coverage of 70% or more on the new files. `classifyCommand` has table tests with at least 80 cases, including every bypass listed in section 6.

## Suggested implementation plan
1. The `agent-runner` profile (section 1) and `classifyCommand` with its tests (part of section 6). Neither depends on Rundeck.
2. `project_catalog`, `rundeck_catalog`, `job_describe`, `job_run` and `execution_output` (sections 2 to 4).
3. The project directory and `target_resolve` (section 7), which also defines the default Runner.
4. Decide Runner selection (the project's default Runner or a map in the MCP), then implement `run_adhoc`.
5. Risk by group (section 5), once the Rundeck side is defined.

## Open questions
- Are project properties (`project.mcp.*`) the right place for the directory, or is a separate source better (for example the node resource model or key storage)?
- Does Rundeck Pro expose a default Runner per project through the API?
- What is the minimum acceptable secret redactor (patterns) for the output the agent sees?
