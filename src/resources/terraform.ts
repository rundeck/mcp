/**
 * Terraform provider documentation resources
 * Covers the official Rundeck Terraform provider (rundeck/rundeck)
 * Registry: https://registry.terraform.io/providers/rundeck/rundeck/latest/docs
 */

export function getTerraformIndex(): string {
  return `# Rundeck Terraform Provider

The official Rundeck Terraform provider lets you manage Rundeck resources as code.

**Registry:** \`rundeck/rundeck\`
**Source:** \`registry.terraform.io/providers/rundeck/rundeck\`

## Provider Configuration

\`\`\`hcl
terraform {
  required_providers {
    rundeck = {
      source  = "rundeck/rundeck"
      version = "~> 0.4"
    }
  }
}

provider "rundeck" {
  url         = "https://rundeck.example.com"
  api_version = "46"
  auth_token  = var.rundeck_token
}
\`\`\`

## Available Resources

| Resource | Description |
|---|---|
| \`rundeck_project\` | Manages a Rundeck project |
| \`rundeck_job\` | Manages a Rundeck job (defined in YAML/JSON) |
| \`rundeck_acl_policy\` | Manages ACL policy documents |
| \`rundeck_private_key\` | Stores a private key in Rundeck's key storage |
| \`rundeck_public_key\` | Stores a public key in Rundeck's key storage |
| \`rundeck_password\` | Stores a password in Rundeck's key storage |

## Available Data Sources

| Data Source | Description |
|---|---|
| \`rundeck_project\` | Reads an existing Rundeck project |
| \`rundeck_public_key\` | Reads a public key from key storage |

## Resource URIs

- \`rundeck://docs/terraform\` — This index
- \`rundeck://docs/terraform/provider\` — Provider configuration reference
- \`rundeck://docs/terraform/resources/project\` — rundeck_project resource
- \`rundeck://docs/terraform/resources/job\` — rundeck_job resource
- \`rundeck://docs/terraform/resources/acl-policy\` — rundeck_acl_policy resource
- \`rundeck://docs/terraform/resources/key-storage\` — Key storage resources
- \`rundeck://docs/terraform/examples\` — Complete HCL examples
`;
}

export function getTerraformProvider(): string {
  return `# Rundeck Provider Configuration

## Required Providers Block

\`\`\`hcl
terraform {
  required_providers {
    rundeck = {
      source  = "rundeck/rundeck"
      version = "~> 0.4"
    }
  }
}
\`\`\`

## Provider Arguments

| Argument | Type | Required | Description |
|---|---|---|---|
| \`url\` | string | yes | Base URL of the Rundeck instance (no trailing slash) |
| \`api_version\` | string | no | API version to use (default: \`"14"\`) — use \`"46"\` for modern instances |
| \`auth_token\` | string | yes | Rundeck API token |

## Provider Block

\`\`\`hcl
provider "rundeck" {
  url         = "https://rundeck.example.com"
  api_version = "46"
  auth_token  = var.rundeck_token
}
\`\`\`

## Recommended: Use Variables for Secrets

\`\`\`hcl
variable "rundeck_token" {
  description = "Rundeck API authentication token"
  type        = string
  sensitive   = true
}

variable "rundeck_url" {
  description = "Rundeck instance URL"
  type        = string
  default     = "https://rundeck.example.com"
}

provider "rundeck" {
  url        = var.rundeck_url
  auth_token = var.rundeck_token
}
\`\`\`

## Environment Variables

The provider reads these environment variables if arguments are not set:

| Variable | Maps to |
|---|---|
| \`RUNDECK_URL\` | \`url\` |
| \`RUNDECK_TOKEN\` | \`auth_token\` |
| \`RUNDECK_API_VERSION\` | \`api_version\` |

\`\`\`bash
export RUNDECK_URL="https://rundeck.example.com"
export RUNDECK_TOKEN="your-api-token"
terraform plan
\`\`\`
`;
}

export function getTerraformProject(): string {
  return `# rundeck_project

Manages a Rundeck project.

## Example

\`\`\`hcl
resource "rundeck_project" "ops" {
  name        = "ops"
  description = "Operations automation project"

  resource_model_source {
    type = "file"
    config = {
      format                 = "resourcexml"
      file                   = "/var/rundeck/projects/ops/etc/resources.xml"
      generateFileAutomatically = "true"
      includeServerNode      = "true"
    }
  }

  extra_config = {
    "project.output.allowUnsanitized" = "true"
  }
}
\`\`\`

## Argument Reference

| Argument | Type | Required | Description |
|---|---|---|---|
| \`name\` | string | yes | Unique project name. Changing this forces recreation. |
| \`description\` | string | no | Human-readable description |
| \`default_node_file_copier_plugin\` | string | no | Plugin for copying files to nodes (default: \`jsch-scp\`) |
| \`default_node_executor_plugin\` | string | no | Plugin for executing commands on nodes (default: \`jsch-ssh\`) |
| \`ssh_authentication_type\` | string | no | SSH auth type: \`privateKey\` or \`password\` |
| \`ssh_key_storage_path\` | string | no | Path in key storage for the SSH private key |
| \`ssh_key_file_path\` | string | no | Filesystem path to the SSH private key |
| \`extra_config\` | map(string) | no | Arbitrary project configuration properties |
| \`resource_model_source\` | block | no | Node source configuration (repeatable) |

### resource_model_source Block

| Argument | Type | Required | Description |
|---|---|---|---|
| \`type\` | string | yes | Source plugin type (e.g., \`file\`, \`url\`, \`aws-ec2\`) |
| \`config\` | map(string) | yes | Plugin-specific configuration |

## Attributes

| Attribute | Description |
|---|---|
| \`id\` | Project name (same as \`name\`) |
| \`name\` | Project name |
| \`ui_url\` | URL to the project in the Rundeck UI |

## Import

\`\`\`bash
terraform import rundeck_project.ops ops
\`\`\`
`;
}

export function getTerraformJob(): string {
  return `# rundeck_job

Manages a Rundeck job. The job definition is provided as a YAML or JSON string.

## Example

\`\`\`hcl
resource "rundeck_job" "restart_service" {
  project_name        = rundeck_project.ops.name
  name                = "Restart Service"
  group_name          = "maintenance"
  description         = "Restarts a system service on target nodes"
  execution_enabled   = true
  node_filter_query   = "tags: linux"
  allow_concurrent_executions = false

  command {
    shell_command = "sudo systemctl restart \${option.service_name}"
  }

  option {
    name                      = "service_name"
    label                     = "Service Name"
    description               = "The systemd service to restart"
    required                  = true
    value_choices             = ["nginx", "postgresql", "redis"]
    require_predefined_choice = true
  }

  notification {
    type      = "onfailure"
    email {
      recipients = ["ops@example.com"]
      subject    = "Job failed: Restart Service"
    }
  }
}
\`\`\`

## Argument Reference

| Argument | Type | Required | Description |
|---|---|---|---|
| \`project_name\` | string | yes | Project this job belongs to |
| \`name\` | string | yes | Job name |
| \`group_name\` | string | no | Job group (folder path, e.g., \`"ops/maintenance"\`) |
| \`description\` | string | no | Job description |
| \`execution_enabled\` | bool | no | Whether executions are enabled (default: \`true\`) |
| \`allow_concurrent_executions\` | bool | no | Allow parallel runs (default: \`false\`) |
| \`max_thread_count\` | number | no | Max nodes to execute on in parallel |
| \`continue_on_error\` | bool | no | Continue if a step fails (default: \`false\`) |
| \`rank_attribute\` | string | no | Node attribute to use for execution ordering |
| \`rank_order\` | string | no | \`ascending\` or \`descending\` |
| \`node_filter_query\` | string | no | Node filter expression |
| \`node_filter_exclude_precedence\` | bool | no | Exclude filter takes precedence |
| \`schedule\` | string | no | Cron expression (e.g., \`"0 0 12 * * ?"\`) |
| \`schedule_enabled\` | bool | no | Whether schedule is active (default: \`true\`) |
| \`time_zone\` | string | no | Timezone for schedule (e.g., \`"America/New_York"\`) |
| \`log_level\` | string | no | \`DEBUG\`, \`VERBOSE\`, \`INFO\`, \`WARN\`, \`ERROR\` |
| \`command\` | block | yes* | One or more steps (*at least one required) |
| \`option\` | block | no | Job options (repeatable) |
| \`notification\` | block | no | Notifications (repeatable) |

### command Block

Supports these mutually exclusive step types:

\`\`\`hcl
# Shell command
command {
  shell_command = "echo hello"
}

# Script inline
command {
  script_file         = "/opt/scripts/deploy.sh"
  script_file_args    = "-e production"
}

# Job reference
command {
  job {
    name        = "Another Job"
    group_name  = "utilities"
    run_for_each_node = false
    args        = "-env production"
  }
}

# Step plugin
command {
  step_plugin {
    type   = "com.batix.rundeck.plugins.AnsiblePlaybookInlineWorkflowStep"
    config = {
      playbook = "- hosts: all\\n  tasks:\\n    - name: ping\\n      ping:"
    }
  }
}
\`\`\`

### option Block

\`\`\`hcl
option {
  name                      = "environment"
  label                     = "Environment"
  description               = "Target environment"
  default_value             = "staging"
  required                  = true
  value_choices             = ["staging", "production"]
  require_predefined_choice = true
  obscure_input             = false  # set true for secrets
  exposed_to_scripts        = true
}
\`\`\`

### notification Block

\`\`\`hcl
notification {
  type = "onfailure"   # onsuccess | onfailure | onstart | onavgduration | onretryablefailure
  email {
    recipients = ["team@example.com"]
    subject    = "Rundeck job failed"
  }
}

notification {
  type = "onsuccess"
  webhook_urls = ["https://hooks.example.com/rundeck"]
}
\`\`\`

## Attributes

| Attribute | Description |
|---|---|
| \`id\` | Job UUID assigned by Rundeck |

## Import

\`\`\`bash
terraform import rundeck_job.restart_service <job-uuid>
\`\`\`

Get the UUID from Rundeck UI or:
\`\`\`bash
rd jobs list -p <project> --outformat "%ID %name"
\`\`\`
`;
}

export function getTerraformAclPolicy(): string {
  return `# rundeck_acl_policy

Manages an ACL policy document in Rundeck. Policies control which users/groups can perform which actions.

## Example

\`\`\`hcl
resource "rundeck_acl_policy" "ops_team" {
  name = "ops-team.aclpolicy"

  policy = <<-YAML
    description: Ops team access policy
    context:
      project: "ops"
    for:
      job:
        - allow: [read, run, kill]
      node:
        - allow: [read, run]
      event:
        - allow: [read]
    by:
      group: [ops-team]
    ---
    description: Ops team system access
    context:
      application: "rundeck"
    for:
      project:
        - match:
            name: "ops"
          allow: [read]
      storage:
        - match:
            path: "keys/ops/.*"
          allow: [read, create, update, delete]
    by:
      group: [ops-team]
  YAML
}
\`\`\`

## Argument Reference

| Argument | Type | Required | Description |
|---|---|---|---|
| \`name\` | string | yes | Policy file name — must end in \`.aclpolicy\` |
| \`policy\` | string | yes | YAML policy document (can contain multiple documents separated by \`---\`) |

## Attributes

| Attribute | Description |
|---|---|
| \`id\` | Policy name |

## ACL Policy YAML Structure

\`\`\`yaml
description: Human-readable description
context:
  project: "project-name"   # OR application: "rundeck"
for:
  job:
    - allow: [read, run, kill, create, update, delete]
  node:
    - allow: [read, run, refresh]
  event:
    - allow: [read, create]
by:
  group: [group-name]       # OR username: [user1, user2]
\`\`\`

## Import

\`\`\`bash
terraform import rundeck_acl_policy.ops_team ops-team.aclpolicy
\`\`\`
`;
}

export function getTerraformKeyStorage(): string {
  return `# Key Storage Resources

Rundeck's key storage holds SSH keys and passwords used for node access.

---

## rundeck_private_key

Stores a private SSH key in Rundeck's key storage.

\`\`\`hcl
resource "rundeck_private_key" "deploy_key" {
  path         = "keys/ops/deploy"
  key_material = file("~/.ssh/deploy_rsa")
}
\`\`\`

### Arguments

| Argument | Type | Required | Description |
|---|---|---|---|
| \`path\` | string | yes | Storage path (e.g., \`keys/project/keyname\`) |
| \`key_material\` | string | yes | PEM-encoded private key content. Mark as sensitive. |

---

## rundeck_public_key

Stores a public SSH key in Rundeck's key storage. Also usable as a data source.

\`\`\`hcl
resource "rundeck_public_key" "deploy_key" {
  path         = "keys/ops/deploy.pub"
  key_material = file("~/.ssh/deploy_rsa.pub")
}

# Read an existing public key
data "rundeck_public_key" "existing" {
  path = "keys/ops/deploy.pub"
}

output "public_key" {
  value = data.rundeck_public_key.existing.key_material
}
\`\`\`

### Arguments

| Argument | Type | Required | Description |
|---|---|---|---|
| \`path\` | string | yes | Storage path |
| \`key_material\` | string | yes (resource) | Public key content |

---

## rundeck_password

Stores a password in Rundeck's key storage.

\`\`\`hcl
resource "rundeck_password" "db_password" {
  path     = "keys/ops/db-password"
  password = var.db_password
}

variable "db_password" {
  type      = string
  sensitive = true
}
\`\`\`

### Arguments

| Argument | Type | Required | Description |
|---|---|---|---|
| \`path\` | string | yes | Storage path |
| \`password\` | string | yes | Password value. Always mark the variable as \`sensitive = true\`. |

---

## Key Storage Path Conventions

\`\`\`
keys/
  global/          # Shared across projects
    deploy-key
    monitoring-key
  project-name/    # Project-specific
    app-key
    db-password
\`\`\`

Referencing in a project:

\`\`\`hcl
resource "rundeck_project" "ops" {
  name = "ops"
  ssh_key_storage_path = rundeck_private_key.deploy_key.path
  # ...
}
\`\`\`
`;
}

export function getTerraformExamples(): string {
  return `# Rundeck Terraform Examples

## Complete Project with Jobs and ACL

\`\`\`hcl
terraform {
  required_providers {
    rundeck = {
      source  = "rundeck/rundeck"
      version = "~> 0.4"
    }
  }
}

variable "rundeck_token" {
  type      = string
  sensitive = true
}

provider "rundeck" {
  url        = "https://rundeck.example.com"
  auth_token = var.rundeck_token
}

# SSH key for node access
resource "rundeck_private_key" "ops_key" {
  path         = "keys/ops/ssh"
  key_material = file("~/.ssh/ops_rsa")
}

# Project
resource "rundeck_project" "ops" {
  name        = "ops"
  description = "Operations automation"

  ssh_key_storage_path = rundeck_private_key.ops_key.path

  resource_model_source {
    type = "url"
    config = {
      url                = "https://inventory.example.com/rundeck/nodes.xml"
      timeout            = "30"
      cache              = "true"
      cacheTimeout       = "30"
    }
  }
}

# Deploy job
resource "rundeck_job" "deploy" {
  project_name      = rundeck_project.ops.name
  name              = "Deploy Application"
  group_name        = "deployments"
  description       = "Deploys the application to target nodes"
  execution_enabled = true

  node_filter_query = "tags: app-server"
  max_thread_count  = 2

  option {
    name          = "version"
    label         = "Version"
    description   = "Application version to deploy"
    required      = true
    regex         = "^\\\\d+\\\\.\\\\d+\\\\.\\\\d+$"
  }

  option {
    name              = "environment"
    label             = "Environment"
    default_value     = "staging"
    value_choices     = ["staging", "production"]
    require_predefined_choice = true
  }

  command {
    shell_command = "/opt/deploy.sh -v \${option.version} -e \${option.environment}"
  }

  notification {
    type = "onsuccess"
    email {
      recipients = ["deploys@example.com"]
      subject    = "Deploy \${option.version} to \${option.environment} succeeded"
    }
  }

  notification {
    type = "onfailure"
    email {
      recipients = ["oncall@example.com"]
      subject    = "Deploy \${option.version} FAILED"
    }
  }

  schedule         = "0 0 3 * * ?"  # Daily at 3am
  schedule_enabled = false           # Manual only by default
}

# Scheduled health check
resource "rundeck_job" "health_check" {
  project_name      = rundeck_project.ops.name
  name              = "Health Check"
  group_name        = "monitoring"
  execution_enabled = true
  schedule          = "0 */5 * * * ?"  # Every 5 minutes
  schedule_enabled  = true

  command {
    shell_command = "curl -sf https://app.example.com/health || exit 1"
  }

  notification {
    type             = "onfailure"
    webhook_urls     = ["https://hooks.slack.com/services/xxx"]
  }
}

# ACL policy
resource "rundeck_acl_policy" "dev_team" {
  name = "dev-team.aclpolicy"

  policy = <<-YAML
    description: Dev team — read and run in ops project
    context:
      project: "ops"
    for:
      job:
        - allow: [read, run]
      event:
        - allow: [read]
      node:
        - allow: [read, run]
    by:
      group: [developers]
  YAML
}
\`\`\`

---

## Importing Existing Resources

\`\`\`bash
# Import a project
terraform import rundeck_project.ops ops

# Import a job (use UUID from Rundeck)
terraform import rundeck_job.deploy <uuid>

# Import an ACL policy
terraform import rundeck_acl_policy.dev_team dev-team.aclpolicy

# Import key storage
terraform import rundeck_private_key.ops_key keys/ops/ssh
\`\`\`

---

## Multi-Project Setup

\`\`\`hcl
locals {
  projects = {
    ops     = { description = "Operations", nodes_tag = "ops" }
    data    = { description = "Data pipelines", nodes_tag = "data" }
    release = { description = "Release automation", nodes_tag = "app" }
  }
}

resource "rundeck_project" "projects" {
  for_each    = local.projects
  name        = each.key
  description = each.value.description

  ssh_key_storage_path = rundeck_private_key.ops_key.path

  resource_model_source {
    type   = "file"
    config = {
      format                    = "resourcexml"
      file                      = "/var/rundeck/projects/\${each.key}/etc/resources.xml"
      generateFileAutomatically = "true"
      includeServerNode         = "false"
    }
  }
}
\`\`\`
`;
}
