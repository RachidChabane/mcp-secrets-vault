# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-08-21 (MVP Release)

### Added
- Initial release of MCP Secrets Vault
- Core MCP server implementation with stdio transport
- Four MCP tools:
  - `discover`: List available secrets without exposing values
  - `describe_policy`: Show policy details for a specific secret
  - `use_secret`: Execute HTTP actions with secrets (GET/POST only)
  - `query_audit`: Query audit logs with pagination
- Security features:
  - Secrets stored only in environment variables
  - Systematic sanitization of all outputs
  - No secret values ever exposed in responses, logs, or errors
  - Deny-by-default policy enforcement
- Policy-based access control:
  - Exact FQDN domain matching (no wildcards)
  - Allowed actions per secret
  - Rate limiting with token bucket algorithm
  - Optional expiration dates
- Comprehensive audit logging:
  - JSONL format for efficient storage
  - Automatic rotation by size or age
  - Query support with time range and secret ID filters
- CLI tools:
  - `doctor` command for configuration diagnostics
  - `validate-config` for configuration validation
  - Schema generation for config files
- Test coverage at 95%+ (80% threshold required)
- TypeScript strict mode with comprehensive type safety
- Structured JSON logging with sensitive data redaction

### Security
- Environment variable mapping with zero exposure guarantee
- Multi-layer sanitization and redaction
- Immutable data structures throughout
- Input validation with Zod schemas
- Structured errors with non-sensitive codes

[0.1.0]: https://github.com/mcp-secrets-vault/mcp-secrets-vault/releases/tag/v0.1.0