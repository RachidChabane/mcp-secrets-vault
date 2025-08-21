# Contributing to MCP Secrets Vault

Thank you for your interest in contributing to MCP Secrets Vault! This document provides guidelines and instructions for contributing to the project.

## 🎯 Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and professional in all interactions.

## 🚀 Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/mcp-secrets-vault.git
   cd mcp-secrets-vault
   ```
3. **Set up the development environment**:
   ```bash
   npm install
   npm run dev
   ```

## 🌳 Branch Strategy

We use a Git Flow-inspired branching strategy:

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feat/*`: New features
- `fix/*`: Bug fixes  
- `hotfix/*`: Urgent production fixes
- `release/*`: Release preparation

### Creating a Branch

```bash
# For a new feature
git checkout -b feat/your-feature-name

# For a bug fix
git checkout -b fix/issue-description

# For a hotfix
git checkout -b hotfix/critical-issue
```

## 📝 Commit Convention

We use emoji-prefixed commits with task numbers:

```bash
git commit -m ":sparkles: [task-XX] Add new authentication method"
```

### Common Emoji Prefixes

- 🎯 - Achieving goals/milestones
- 🔧 - Configuration/fixes
- 🔐 - Security enhancements
- 🔍 - Search/discovery features
- 🧪 - Tests
- 🐛 - Bug fixes
- ✨ - New features (generic)
- 📜 - Policy
- ♻️ - Refactoring
- 🔒 - Security improvements
- 📚 - Documentation
- 🩺 - Diagnostics/health checks
- ⚡️ - Performance improvements
- ⏲️ - Time/rate limiting features
- 🗃️ - Database/storage features

## 📋 Development Guidelines

### Code Quality Standards

1. **TypeScript**: Strict mode enabled
   ```bash
   # Type checking
   npm run typecheck
   ```

2. **Constants**: All strings and configuration values in constants files
   - `src/constants/text-constants.ts` - User-facing text
   - `src/constants/config-constants.ts` - Configuration values

3. **Error Handling**: Use structured errors with codes
   ```typescript
   throw new ToolError(ERROR_CODES.FORBIDDEN_DOMAIN, TEXT.ERROR_FORBIDDEN_DOMAIN);
   ```

### Testing Requirements

- **Minimum Coverage**: 80%
- **Test Files**: `.test.ts` suffix, colocated with source
- **Run Tests**:
  ```bash
  # Watch mode
  npm test
  
  # Single run with coverage
  npm run test:coverage
  
  # Specific test
  npx vitest run src/services/rate-limiter.test.ts
  ```

### Security Considerations

1. **Never expose secrets** in:
   - Error messages
   - Log outputs
   - API responses
   - Audit records

2. **Validate all inputs** using Zod schemas
3. **Sanitize all outputs** before returning
4. **Use deny-by-default** for all access control

## 🔄 Pull Request Process

1. **Update your fork**:
   ```bash
   git checkout develop
   git pull upstream develop
   ```

2. **Create your feature branch** from `develop`

3. **Make your changes**:
   - Write/update tests
   - Update documentation if needed
   - Ensure all tests pass
   - Maintain code coverage ≥80%

4. **Validate your changes**:
   ```bash
   # Run all checks
   npm run typecheck
   npm run test:coverage
   node check_function_length.js
   ```

5. **Push to your fork**:
   ```bash
   git push origin feat/your-feature
   ```

6. **Create a Pull Request**:
   - Target the `develop` branch
   - Fill out the PR template (automatically loaded from `.github/pull_request_template.md`)
   - Link related issues
   - Ensure CI checks pass

### PR Title Format

```
[task-XX] Brief description of changes
```

### PR Description

A pull request template is automatically loaded when you create a PR. The template includes:
- Summary and task reference
- Type of change checkboxes
- Testing instructions
- Quality checklist
- Additional notes section

The template file is located at `.github/pull_request_template.md` and will be automatically populated in your PR description.

## 🏗️ Architecture Guidelines

### Service Layer Pattern

All business logic should be in service classes:

```typescript
export class MyService implements IMyService {
  constructor(private readonly dependency: IDependency) {}
  
  async performAction(input: ValidatedInput): Promise<Result> {
    // Implementation
  }
}
```

### Table-Driven Design

Prefer lookup tables over switch statements:

```typescript
const ACTION_HANDLERS: Record<string, Handler> = {
  'http_get': handleGet,
  'http_post': handlePost,
};

const handler = ACTION_HANDLERS[action];
if (!handler) {
  throw new ToolError(ERROR_CODES.INVALID_ACTION, TEXT.ERROR_INVALID_ACTION);
}
```

## 📚 Documentation

When adding new features:

1. Update README.md if it affects usage
2. Add JSDoc comments to public APIs
3. Update configuration examples
4. Add integration examples if applicable

## 🐛 Reporting Issues

Please use the GitHub issue tracker. Include:

1. **Description** of the issue
2. **Steps to reproduce**
3. **Expected behavior**
4. **Actual behavior**
5. **Environment details** (Node version, OS)
6. **Error messages** or logs

## 💡 Feature Requests

We welcome feature suggestions! Please:

1. Check existing issues first
2. Describe the use case
3. Explain the expected behavior
4. Provide examples if possible

## 📦 Release Process

Releases are managed by maintainers:

1. Create release branch from `develop`
2. Update version and changelog
3. Create PR to `main`
4. Tag release after merge
5. Publish to npm

## 🤝 Getting Help

- Check the [README](./README.md) first
- Review existing [issues](https://github.com/RachidChabane/mcp-secrets-vault/issues)
- Ask questions in discussions
- Contact maintainers if needed

## 🏆 Recognition

Contributors will be recognized in:
- Release notes
- Contributors file
- Project documentation

Thank you for contributing to MCP Secrets Vault!