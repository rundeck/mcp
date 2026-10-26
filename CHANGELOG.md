# Changelog

All notable changes to `@rundeck/mcp` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- [RUN-5039] Bake release version into Docker User-Agent ([#105](https://github.com/rundeck/mcp/pull/105))

### Security

- [RUN-5043] Pin container images and GitHub Actions by digest ([#113](https://github.com/rundeck/mcp/pull/113))

### Maintenance & CI

- Add Apache-2.0 LICENSE file ([#103](https://github.com/rundeck/mcp/pull/103))

### Dependencies

| Dependency | Updated to | PR |
| :--- | :--- | :--- |
| `@hono/node-server` | `v2.1.4` | [#114](https://github.com/rundeck/mcp/pull/114) |
| `@modelcontextprotocol/client` | `v2.2.0` | [#112](https://github.com/rundeck/mcp/pull/112) |
| `@modelcontextprotocol/inspector` | `v2.10.1` | [#98](https://github.com/rundeck/mcp/pull/98) |
| `@modelcontextprotocol/server` | `v2.3.1` | [#116](https://github.com/rundeck/mcp/pull/116) |
| `concurrently` | `v10.0.6` | [#108](https://github.com/rundeck/mcp/pull/108) |
| `es-toolkit` | `v1.52.0` | [#100](https://github.com/rundeck/mcp/pull/100) |
| `fast-uri` | `v4.2.2` | [#117](https://github.com/rundeck/mcp/pull/117) |
| `hono` | `v4.13.13` | [#95](https://github.com/rundeck/mcp/pull/95) |
| `ip-address` | `v10.7.3` | [#104](https://github.com/rundeck/mcp/pull/104) |
| `jest monorepo` | latest | [#101](https://github.com/rundeck/mcp/pull/101) |
| `marked` | `v18.1.0` | [#97](https://github.com/rundeck/mcp/pull/97) |
| `rolldown` | `v1.2.13` | [#109](https://github.com/rundeck/mcp/pull/109) |
| `ts-jest` | `v29.4.15` | [#110](https://github.com/rundeck/mcp/pull/110) |
| `yaml` | `v2.9.1` | [#111](https://github.com/rundeck/mcp/pull/111) |
| `zod` | `v4.6.6` | [#102](https://github.com/rundeck/mcp/pull/102) |

## [1.0.0] - 2026-08-26

First stable GA release of `@rundeck/mcp`, providing Rundeck documentation resources, API/job/runner/ACL/resource-model tools, and MCP protocol support over stdio.

### Security

- Pin all npm dependencies to lockfile-resolved versions ([#93](https://github.com/rundeck/mcp/pull/93))

### Maintenance & CI

- Update README.md ([#94](https://github.com/rundeck/mcp/pull/94))
- Add GitHub Actions workflow to create GitHub Releases ([#92](https://github.com/rundeck/mcp/pull/92))
- Bump all open Renovate-flagged dependencies ([#91](https://github.com/rundeck/mcp/pull/91))
- Bump quarantine-pinned deps back to latest ([#90](https://github.com/rundeck/mcp/pull/90))

### Dependencies

| Dependency | Updated to | PR |
| :--- | :--- | :--- |
| `hono` | `v4.13.3` | [#75](https://github.com/rundeck/mcp/pull/75) |

[Unreleased]: https://github.com/rundeck/mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/rundeck/mcp/releases/tag/v1.0.0
