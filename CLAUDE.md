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
- **Before committing**: Always run `npm run typecheck` to ensure no type errors

## Project Architecture

This is an MCP (Model Context Protocol) server for secure secret management. The codebase follows a modular TypeScript architecture:

### Core Structure
- **src/index.ts**: Entry point - MCP server initialization and tool registration
- **src/constants/**: Configuration and text constants with strict typing
  - config-constants.ts: Server configuration, limits, timeouts, error codes
  - text-constants.ts: User-facing messages and strings
- **src/interfaces/**: TypeScript interfaces (currently empty, to be populated)
- **src/services/**: Business logic services (currently empty, to be populated)
- **src/tools/**: MCP tool implementations (currently empty, to be populated)
- **src/utils/**: Utility functions (currently empty, to be populated)

### Key Technical Decisions
- **TypeScript**: Strict mode enabled with all strict checks
- **Module System**: ES modules (type: "module" in package.json)
- **Node Version**: Requires Node.js 20+
- **Build Tool**: tsup for fast ESM builds
- **Test Framework**: Vitest with 80% coverage requirement
- **Dependencies**: 
  - @modelcontextprotocol/sdk for MCP integration
  - zod for runtime validation

### Code Quality Standards
- Maximum function length: 20 lines (enforced by MAX_FUNCTION_LINES constant)
- All constants centralized in constants/ directory
- Comprehensive test coverage for all constants and utilities
- TypeScript strict mode with no implicit any

### Testing Strategy
- Unit tests use Vitest with .test.ts suffix
- Tests colocated with source files
- Coverage thresholds: 80% for branches, functions, lines, and statements
- Mock reset and restore enabled for test isolation