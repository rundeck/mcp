/**
 * Curated reference for commonly-used workflow step plugin `type` strings and
 * their `configuration` field names. `job_create`'s `plugin` step is a generic
 * `{ type, configuration }` passthrough with no built-in knowledge of any
 * specific plugin's fields — this resource fills that gap for a small,
 * high-value set of plugin families rather than attempting to model every
 * Rundeck plugin ecosystem in the tool schema.
 */

/**
 * Get PagerDuty step plugin reference
 */
export function getPagerDutyStepReference(): string {
  return `# PagerDuty Step Plugins

Workflow steps (\`nodeStep: false\`) that call the PagerDuty API once per job execution, not once per node.

Two credential conventions exist across the plugin family:
- Older \`pd-*\` steps take \`api_token\` + \`email\`
- Newer \`pagerduty-*\` steps take \`apiKey\` (no email)

Never hardcode the token — use a secure job option (\`secure: true\`, \`valueExposed: false\`) backed by Rundeck Key Storage, and reference it in \`configuration\` as \`\${option.pd_api_token}\`.

## Incident notes, updates, status

### pd-note-step
\`\`\`yaml
configuration:
  incident_id: \${option.incident_id}
  note: 'Automated remediation started'
  api_token: \${option.pd_api_token}
  email: \${option.pd_from_email}
nodeStep: false
type: pd-note-step
\`\`\`

### pd-update-incident-step
\`\`\`yaml
configuration:
  incident_id: \${option.incident_id}
  status: resolved              # acknowledged | resolved
  resolution: 'Service restored by automation.'
  api_token: \${option.pd_api_token}
  email: \${option.pd_from_email}
nodeStep: false
type: pd-update-incident-step
\`\`\`

### pd-status-update-step
\`\`\`yaml
configuration:
  incident_id: \${option.incident_id}
  message: 'Mitigation applied; monitoring recovery.'
  api_token: \${option.pd_api_token}
  email: \${option.pd_from_email}
nodeStep: false
type: pd-status-update-step
\`\`\`

## Escalation and responders

### pd-escalate-incident-step
\`\`\`yaml
configuration:
  incident_id: \${option.incident_id}
  escalation_level: '2'
  api_token: \${option.pd_api_token}
  email: \${option.pd_from_email}
nodeStep: false
type: pd-escalate-incident-step
\`\`\`

### pagerduty-add-additional-responders
\`\`\`yaml
configuration:
  pd-id: \${option.incident_id}
  message: 'Paging the database on-call for assistance.'
  requester: \${option.requester_user_id}
  apiKey: \${option.pd_api_token}
nodeStep: false
type: pagerduty-add-additional-responders
\`\`\`

### pagerduty-update-escalation
\`\`\`yaml
configuration:
  pd-id: \${option.incident_id}
  escalation-policy: \${option.escalation_policy_id}
  requester: \${option.requester_user_id}
  apiKey: \${option.pd_api_token}
nodeStep: false
type: pagerduty-update-escalation
\`\`\`

## Response plays and incident workflows

### pd-run-response-play-step
\`\`\`yaml
configuration:
  incident_id: \${option.incident_id}
  response_play_id: \${option.response_play_id}
  api_token: \${option.pd_api_token}
  email: \${option.pd_from_email}
nodeStep: false
type: pd-run-response-play-step
\`\`\`

### pd-start-incident-workflow-step
\`\`\`yaml
configuration:
  incident_id: \${option.incident_id}
  incident_workflow_id: \${option.incident_workflow_id}
  api_token: \${option.pd_api_token}
nodeStep: false
type: pd-start-incident-workflow-step
\`\`\`

## Events and change events

### pd-sent-event-step (Events API v2 alert)
\`\`\`yaml
configuration:
  event_action: trigger          # trigger | acknowledge | resolve
  service_key: \${option.pd_integration_key}
  payload_summary: 'Disk usage above threshold'
  payload_source: \${option.target_host}
  payload_severity: warning      # critical | error | warning | info
  dedupe_key: ''                 # set to de-duplicate / to ack/resolve a prior event
nodeStep: false
type: pd-sent-event-step
\`\`\`

### pagerduty-send-change-event
\`\`\`yaml
configuration:
  routingKey: \${option.pd_integration_key}
  summary: 'Deployed to production'
  source: \${job.name}
  apiKey: \${option.pd_api_token}
nodeStep: false
type: pagerduty-send-change-event
\`\`\`

## Lookups (read-only)

### pagerduty-get-incident
\`\`\`yaml
configuration:
  pd-id: \${option.incident_id}
  includeFirstTriggerLogEntry: 'true'
  apiKey: \${option.pd_api_token}
nodeStep: false
type: pagerduty-get-incident
\`\`\`

### pagerduty-get-user
\`\`\`yaml
configuration:
  pd-id: \${option.user_id}
  apiKey: \${option.pd_api_token}
nodeStep: false
type: pagerduty-get-user
\`\`\`

## Capturing step output: pagerduty-incident-output-capture LogFilter
PagerDuty lookup/action steps expose structured output; capture it with this LogFilter (attach via \`job_create\`'s \`logFilters\` field) rather than parsing logs by hand:

\`\`\`yaml
plugins:
  LogFilter:
    - type: pagerduty-incident-output-capture
      config:
        filterName: incident        # data namespace: \${data.incident.*}
        stepStatus: 'true'
        logOutputSettings: 'true'
\`\`\`

Reminder: captured \`\${data.*}\` is not visible in notification blocks — uplift with an \`export-var\` workflow step and reference it as \`\${export.*}\`. See \`rundeck://jobs/schema\` and the \`job_create\` guidance for the \`logFilters\`/\`export-var\` fields.

## Conventions recap
- All PagerDuty steps are workflow steps: \`nodeStep: false\`.
- Token via a secure option backed by Key Storage, referenced as \`\${option.pd_api_token}\` — never hardcoded.
- \`pd-*\` steps use \`api_token\` + \`email\`; \`pagerduty-*\` steps use \`apiKey\`.
- Use \`pd-sent-event-step\` / \`pagerduty-send-change-event\` for the Events API (alerts / change events); use the incident steps (note, update, status, escalate, responders) when acting on an existing incident.`;
}

/**
 * Get Kubernetes step plugin reference (IAM-based cluster family)
 */
export function getKubernetesStepReference(): string {
  return `# Kubernetes Step Plugins (\`kubernetes-clusters-*\` family)

The \`kubernetes-clusters-*\` family is the modern, IAM-based Kubernetes plugin: it carries no token, URL, or kubeconfig in the job — authentication is handled externally via cluster/cloud IAM configured on the runner (e.g. EKS/GKE IAM). Prefer this family for new jobs.

All steps in this family are \`nodeStep: true\`. Only include the configuration fields you actually need.

A separate, older pod-centric \`Kubernetes-*\` family (\`Kubernetes-Execute-Step\`, \`Kubernetes-Describe-Pod\`, etc.) exists for environments without IAM-based cluster auth; it takes an explicit \`token\`/\`url\`/\`config_file\` and should only be used when the cluster family can't cover the need (e.g. exec into a specific pod, attach an ephemeral debug container).

### kubernetes-clusters-create-object
\`\`\`yaml
configuration:
  namespace: default
  objectType: Pods
  objectYaml: |-
    apiVersion: v1
    kind: Pod
    metadata:
      name: \${option.pod_name}
    spec:
      containers:
        - name: app
          image: nginx:latest
  outputFormat: JSON
nodeStep: true
type: kubernetes-clusters-create-object
\`\`\`
\`\${option.x}\` substitution works inside \`objectYaml\`.

### kubernetes-clusters-delete-object
\`\`\`yaml
configuration:
  namespace: default
  objectName: \${option.deployment}
  objectType: Deployments
  outputFormat: JSON
nodeStep: true
type: kubernetes-clusters-delete-object
\`\`\`

### kubernetes-clusters-describe-object
\`\`\`yaml
configuration:
  namespace: default
  objectName: \${option.pod_name}
  objectType: Pods
  outputFormat: JSON
nodeStep: true
type: kubernetes-clusters-describe-object
\`\`\`

### kubernetes-clusters-list-objects
\`\`\`yaml
configuration:
  namespace: default
  objectType: Pods
  outputFormat: 'Simple List'    # 'Simple List' | 'JSON'
  allNamespaces: 'true'          # optional
  fieldSelector: 'status.phase=Running'   # optional
  labelSelector: 'app=nginx'     # optional
nodeStep: true
type: kubernetes-clusters-list-objects
\`\`\`

### kubernetes-clusters-run-script
Spins up an ad-hoc container, runs a script inside it, tears it down — use for \`kubectl\`/\`helm\` without installing them on the runner. The script runs **inside the container**, which inherits the service account RBAC of the namespace it runs in.
\`\`\`yaml
configuration:
  containerImage: dtzar/helm-kubectl   # or bitnami/kubectl, alpine/k8s
  imagePullPolicy: IfNotPresent
  invocationCommand: sh -c
  namespace: default
  script: |-
    #!/bin/sh
    kubectl get pods --all-namespaces
nodeStep: true
type: kubernetes-clusters-run-script
\`\`\`

## Literal-only fields (no \${option.x} substitution)
\`objectType\`, \`outputFormat\`, and \`imagePullPolicy\` are validated as enum literals at import time — use one of the exact values shown above, not a dynamic reference. (\`job_validate\` flags a \${...} value in these fields as a warning.) Free-text fields like \`namespace\`, \`objectName\`, and \`objectYaml\` accept \${option.x} normally.`;
}
