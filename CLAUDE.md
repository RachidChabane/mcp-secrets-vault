# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build and Development
- **Development mode**: `npm run dev` - Run the TypeScript source with tsx
- **Build project**: `npm run build` - Build with tsup to create ESM output in dist/
- **Start production**: `npm start` - Run the built application from dist/

### Testing
- **Run tests**: `npm test` - Run tests in watch mode with Vitest
- **Run tests once**: `npm run test:once` - Single test run
- **Test coverage**: `npm run test:coverage` - Generate coverage report (80% threshold required)
- **Run specific test**: `npx vitest run path/to/test.ts`

### Code Quality
- **Type checking**: `npm run typecheck` or `npm run lint` - Both run TypeScript compiler checks
- **Function length check**: `node check_function_length.js` - Validate 20-line function limit
- **Config validation**: `npm run validate:config` - Validate configuration files
- **Schema generation**: `npm run generate:schema` - Generate JSON schema from TypeScript types
- **Before committing**: Always run `npm run typecheck` to ensure no type errors

## Project Architecture

This is an MCP (Model Context Protocol) server for secure secret management with policy-based access control, rate limiting, and comprehensive audit logging.

### Core Architecture Components

**MCP Server Core** (src/index.ts):
- Server initialization with stdio transport
- Tool registration and request routing using table-driven dispatch
- Centralized error handling with structured responses
- Graceful shutdown handling

**Constants Layer** (src/constants/):
- config-constants.ts: All configuration values, limits, timeouts, error codes
- text-constants.ts: User-facing messages, field names, validation text
- Strict TypeScript typing with `as const` assertions

**Service Layer** (src/services/):
- **EnvSecretProvider**: Maps secret IDs to environment variables
- **PolicyProviderService**: Loads and manages access policies
- **PolicyEvaluatorService**: Evaluates requests against policies
- **HttpActionExecutor**: Executes HTTP requests with secrets
- **RateLimiterService**: Token bucket rate limiting per secret
- **JsonlAuditService**: Structured audit logging with rotation

**Tool Layer** (src/tools/):
- **DiscoverTool**: Lists available secrets
- **DescribePolicyTool**: Shows policy details for secrets
- **UseSecretTool**: Executes actions with secrets (HTTP GET/POST)
- **QueryAuditTool**: Queries audit logs with pagination

**Interface Layer** (src/interfaces/):
- Type definitions for all major components
- Separation of concerns between data models and business logic

**Utility Layer** (src/utils/):
- Error handling with structured ToolError class
- Security utilities for sanitization and validation
- Logging with sensitive data redaction
- Table-driven utilities for configuration

### Key Technical Decisions

- **TypeScript**: Strict mode with all strict checks enabled
- **Module System**: Pure ES modules (type: "module")
- **Node Version**: Requires Node.js 20+
- **Build Tool**: tsup for fast ESM builds with CLI shebang
- **Test Framework**: Vitest with 95%+ coverage achieved
- **Architecture Pattern**: Dependency injection with service composition
- **Error Handling**: Structured errors with codes and user-friendly messages

### Security Design

- **No Secret Exposure**: Secrets never returned in responses, only used for actions
- **Policy-Based Access**: Every secret requires an explicit policy
- **Rate Limiting**: Configurable per-secret rate limits with token bucket algorithm
- **Audit Logging**: Comprehensive JSONL audit trail for compliance
- **Input Sanitization**: All user inputs validated with Zod schemas
- **Environment Isolation**: Secrets only accessible via controlled environment variable mapping

### Code Quality Standards

- **Function Length**: Maximum 20 lines (enforced by check_function_length.js)
- **Test Coverage**: 95%+ achieved (80% threshold required)
- **Constant Centralization**: All strings and configuration in constants/
- **Table-Driven Design**: Eliminates type-based branching in favor of lookup tables
- **Error Codes**: Structured error responses with consistent codes

### Testing Strategy

- **Unit Tests**: .test.ts suffix, colocated with source files
- **Integration Tests**: .integration.test.ts for cross-component testing
- **Snapshot Tests**: .snapshot.test.ts for complex object validation
- **Coverage**: v8 provider with HTML/LCOV reports
- **Mocking**: Automatic reset/restore for test isolation