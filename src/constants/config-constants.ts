import { PACKAGE_VERSION, PACKAGE_NAME } from '../utils/package-info.js';

export const CONFIG = {
  // Version
  VERSION: PACKAGE_VERSION,
  
  // Server settings
  SERVER_NAME: PACKAGE_NAME,
  SERVER_VERSION: PACKAGE_VERSION,
  PROTOCOL_VERSION: '1.0.0',
  
  // HTTP settings
  HTTP_TIMEOUT_MS: 30000,
  HTTP_MAX_REDIRECTS: 5,
  HTTP_DEFAULT_USER_AGENT: `MCP-Secrets-Vault/${PACKAGE_VERSION}`,
  
  // Rate limiting
  DEFAULT_RATE_LIMIT_REQUESTS: 100,
  DEFAULT_RATE_LIMIT_WINDOW_SECONDS: 3600,
  RATE_LIMIT_CLEANUP_INTERVAL_MS: 60000,
  MILLISECONDS_PER_SECOND: 1000,
  RATE_LIMIT_WINDOW_MULTIPLIER: 2,
  
  // Audit settings
  AUDIT_FILE_PREFIX: 'audit',
  AUDIT_FILE_EXTENSION: '.jsonl',
  AUDIT_MAX_FILE_SIZE_MB: 100,
  AUDIT_MAX_FILE_AGE_DAYS: 30,
  AUDIT_ROTATION_CHECK_INTERVAL_MS: 3600000,
  AUDIT_DEFAULT_PAGE_SIZE: 50,
  AUDIT_MAX_PAGE_SIZE: 500,
  
  // Response limits
  RESPONSE_MAX_BODY_LENGTH: 10000,
  RESPONSE_TRUNCATION_MESSAGE: '... [truncated]',
  
  // Sanitization - Comprehensive patterns for defense in depth
  SANITIZE_AUTH_HEADER_PATTERN: /authorization/i,
  SANITIZE_SECRET_PATTERN: /\b(api[_-]?key|token|password|auth|bearer|credential|private[_-]?key|access[_-]?key)\b/i,
  SANITIZE_REPLACEMENT: '[REDACTED]',
  
  // Additional redaction patterns for security hardening
  REDACT_URL_AUTH_PATTERN: /https?:\/\/[^:]+:[^@]+@[^\s]+/gi,
  REDACT_JWT_PATTERN: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  REDACT_BEARER_TOKEN_PATTERN: /bearer\s+[a-zA-Z0-9\-._~+\/]+=*/gi,
  REDACT_API_KEY_PATTERNS: [
    /\b[a-zA-Z0-9]{32,}\b/g,  // Generic long tokens
    /sk[-_]test[-_][a-zA-Z0-9]{24,}/gi,  // Stripe test keys
    /sk[-_]live[-_][a-zA-Z0-9]{24,}/gi,  // Stripe live keys
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,  // UUIDs
    /ghp_[a-zA-Z0-9]{36}/g,  // GitHub personal access tokens
    /gho_[a-zA-Z0-9]{36}/g,  // GitHub OAuth tokens
  ],
  REDACT_ENV_VAR_PATTERN: /\b[A-Z][A-Z0-9_]*_(KEY|SECRET|TOKEN|PASSWORD|API|CREDENTIAL)\b/g,
  REDACT_KEY_VALUE_PATTERN: /(api[_-]?key|secret|token|password|auth|bearer|credential|private[_-]?key)\s*[:=]\s*[^\s,;}]+/gi,
  
  // Validation
  MAX_SECRET_ID_LENGTH: 100,
  MAX_DOMAIN_LENGTH: 253,
  MAX_ACTION_LENGTH: 50,
  MAX_REASON_LENGTH: 500,
  MAX_URL_LENGTH: 2048,
  MAX_HEADER_NAME_LENGTH: 100,
  MAX_HEADER_VALUE_LENGTH: 8192,
  SECRET_ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  ENV_VAR_REGEX: /^[A-Z][A-Z0-9_]*$/,
  MIN_SECRET_ID_LENGTH: 1,
  MIN_ENV_VAR_LENGTH: 1,
  MIN_DOMAIN_LENGTH: 3,
  DOMAIN_REGEX: /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i,
  ACTION_REGEX: /^[a-z_]+$/,
  URL_REGEX: /^https?:\/\/([\w\-]+\.)+[\w\-]+(:\d+)?(\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?$/,
  HEADER_NAME_REGEX: /^[a-zA-Z0-9\-_]+$/,
  
  // File paths
  DEFAULT_CONFIG_FILE: 'vault.config.json',
  ENV_VAULT_CONFIG: 'VAULT_CONFIG',
  DEFAULT_POLICIES_DIR: 'policies',
  DEFAULT_POLICIES_FILE: 'policies.json',
  DEFAULT_MAPPINGS_FILE: 'mappings.json',
  DEFAULT_AUDIT_DIR: 'audit',
  
  // Log levels
  LOG_LEVEL_ERROR: 'ERROR',
  LOG_LEVEL_WARN: 'WARN',
  LOG_LEVEL_INFO: 'INFO',
  LOG_LEVEL_DEBUG: 'DEBUG',
  DEFAULT_LOG_LEVEL: 'INFO',
  
  // Error codes
  ERROR_CODE_UNKNOWN_SECRET: 'unknown_secret',
  ERROR_CODE_FORBIDDEN_DOMAIN: 'forbidden_domain',
  ERROR_CODE_FORBIDDEN_ACTION: 'forbidden_action',
  ERROR_CODE_TTL_EXPIRED: 'ttl_expired',
  ERROR_CODE_RATE_LIMITED: 'rate_limited',
  ERROR_CODE_PAYLOAD_TOO_LARGE: 'payload_too_large',
  ERROR_CODE_MISSING_ENV: 'missing_env',
  ERROR_CODE_TIMEOUT: 'timeout',
  ERROR_CODE_INVALID_REQUEST: 'invalid_request',
  ERROR_CODE_INVALID_POLICY: 'invalid_policy',
  ERROR_CODE_POLICY_EXPIRED: 'policy_expired',
  ERROR_CODE_NO_POLICY: 'no_policy',
  ERROR_CODE_POLICIES_NOT_LOADED: 'policies_not_loaded',
  ERROR_CODE_UNKNOWN_TOOL: 'unknown_tool',
  ERROR_CODE_DUPLICATE_TOOL: 'duplicate_tool',
  ERROR_CODE_INVALID_METHOD: 'invalid_method',
  ERROR_CODE_INVALID_INJECTION_TYPE: 'invalid_injection_type',
  ERROR_CODE_INVALID_URL: 'invalid_url',
  ERROR_CODE_INVALID_HEADERS: 'invalid_headers',
  ERROR_CODE_EXECUTION_FAILED: 'execution_failed',
  
  // Pagination
  DEFAULT_PAGE_NUMBER: 1,
  DEFAULT_PAGE_SIZE: 50,
  
  // Function size limits (for code quality)
  MAX_FUNCTION_LINES: 20,
  
  // Cache settings
  CACHE_TTL_MS: 300000, // 5 minutes
  
  // Header allowlist for responses
  ALLOWED_RESPONSE_HEADERS: [
    'content-type',
    'content-length',
    'date',
    'etag',
    'cache-control',
    'x-request-id',
    'x-rate-limit-remaining',
    'x-rate-limit-reset'
  ],
  
  // Supported HTTP methods
  SUPPORTED_HTTP_METHODS: ['GET', 'POST'] as const,
  
  // Supported actions for policies
  SUPPORTED_ACTIONS: ['http_get', 'http_post'] as const,
  
  // HTTP header names
  HEADER_AUTHORIZATION: 'authorization',
  HEADER_USER_AGENT: 'user-agent',
  HEADER_CONTENT_TYPE: 'content-type',
  
  // HTTP fetch options
  FETCH_REDIRECT_MODE: 'manual' as const,
  
  // Default values
  DEFAULT_TIMEZONE: 'UTC',
  DEFAULT_ENCODING: 'utf-8',
  
  // Security defaults (deny-by-default posture)
  DEFAULT_ALLOW_DOMAINS: [] as readonly string[],
  DEFAULT_ALLOW_ACTIONS: [] as readonly string[],
  DEFAULT_MAX_REQUEST_SIZE: 1024 * 1024, // 1MB
  DEFAULT_REQUIRE_HTTPS: true,
  DEFAULT_ALLOW_REDIRECTS: false,
  DEFAULT_SANITIZE_RESPONSES: true,
  DEFAULT_AUDIT_ALL_REQUESTS: true,
  
  // Environment variable prefix
  ENV_PREFIX: 'MCP_VAULT_',
  
  // Exit codes
  EXIT_CODE_SUCCESS: 0,
  EXIT_CODE_ERROR: 1,
  EXIT_CODE_INVALID_CONFIG: 2,
  EXIT_CODE_MISSING_DEPENDENCY: 3,
  
  // File system error codes
  FS_ERROR_ENOENT: 'ENOENT',
  
  // Unit conversion constants
  BYTES_PER_MB: 1024 * 1024,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  
  // Numeric defaults
  ZERO_COUNT: 0,
  
  // Line ending pattern
  LINE_ENDING_PATTERN: /\r?\n/,
  
  // Process signals
  SIGNAL_INT: 'SIGINT',
  SIGNAL_TERM: 'SIGTERM',
  
  // Process arguments
  PROCESS_ARGV_FILE_INDEX: 1,
  
  // Environment variables
  ENV_TEST_SECRET_MAPPINGS: 'TEST_SECRET_MAPPINGS',
  
  // URL schemes
  FILE_URL_SCHEME: 'file://',
  INDEX_JS_SUFFIX: '/index.js',
  CLI_DOCTOR_MODULE: './cli/doctor.js',
  
  // Logging patterns
  STACK_TRACE_PATTERN: '\n    at ',
  EMPTY_STRING_FALLBACK: '',
  
  // Exception field names
  EXCEPTION_FIELD_NAMES: ['description', 'environment'] as const,
  
  // Sensitive key patterns for logging
  SENSITIVE_KEY_PATTERNS: ['SECRET', 'KEY', 'TOKEN', 'PASSWORD'] as const,
  
  // JSON Schema metadata
  JSON_SCHEMA_DRAFT: 'http://json-schema.org/draft-07/schema#',
  JSON_SCHEMA_ID_PREFIX: 'mcp-secrets-vault',
  JSON_SCHEMA_VERSION: 'v1.0.0',
  JSON_SCHEMA_FILENAME: 'vault.config.schema.json',
  JSON_SCHEMA_NAME: 'VaultConfig',
  
  // ANSI color codes for terminal output
  ANSI_RESET: '\x1b[0m',
  ANSI_RED: '\x1b[31m',
  ANSI_GREEN: '\x1b[32m',
  ANSI_YELLOW: '\x1b[33m',
  ANSI_BLUE: '\x1b[34m',
  ANSI_CYAN: '\x1b[36m',
  ANSI_GRAY: '\x1b[90m',
  
  // CLI formatting
  CLI_SEPARATOR_LINE: '═'.repeat(60),
  CLI_SEPARATOR_LINE_THIN: '━'.repeat(60),
  
  // CLI status values  
  CLI_STATUS_OK: 'OK' as const,
  CLI_STATUS_WARN: 'WARN' as const,
  CLI_STATUS_ERROR: 'ERROR' as const,
  
  // CLI arguments
  CLI_ARG_HELP_LONG: '--help' as const,
  CLI_ARG_HELP_SHORT: '-h' as const,
  
  // Content types
  CONTENT_TYPE_JSON: 'application/json',
  
  // File encoding
  UTF8_ENCODING: 'utf-8' as const,
  
  // JSON formatting
  JSON_INDENT_SIZE: 2,
  
  // Zod schema configuration
  ZOD_REF_STRATEGY_NONE: 'none' as const,
  
  // Redaction patterns for logging
  REDACT_ENV_PATTERN: /\b[A-Z][A-Z0-9_]*_(PASSWORD|SECRET|KEY|TOKEN|CREDENTIAL|API)\b/g,
  REDACT_GENERIC_TOKEN: /\b[a-zA-Z0-9_-]{32,}\b/g,
  REDACT_CONTROL_CHARS: /[\x00-\x1F\x7F]/g,
  
  // Sensitive field names for logging
  SENSITIVE_FIELD_NAMES: [
    'password', 'secret', 'token', 'key', 'auth', 'authorization',
    'apikey', 'api_key', 'access_token', 'refresh_token', 'private_key',
    'client_secret', 'webhook_secret', 'signing_key', 'encryption_key',
    'database_url', 'connection_string', 'env', 'envvar', 'environment'
  ] as const,
  
  // Doctor CLI thresholds
  DOCTOR_RATE_LIMIT_MIN_REQUESTS: 10,
  DOCTOR_RATE_LIMIT_MAX_REQUESTS: 10000,
  DOCTOR_RATE_LIMIT_MIN_WINDOW: 60,
  DOCTOR_RATE_LIMIT_MAX_WINDOW: 86400,
  DOCTOR_FILE_SIZE_WARN_MB: 500,
  DOCTOR_FILE_AGE_WARN_DAYS: 90,
  DOCTOR_POLICY_EXPIRING_SOON_DAYS: 7,
  DOCTOR_MIN_DOMAIN_COUNT: 1,
  DOCTOR_MAX_DOMAIN_COUNT: 100,
  DOCTOR_SUSPICIOUS_DOMAIN_PATTERNS: ['localhost', '127.0.0.1', '0.0.0.0', 'test.com', 'example.com'] as const
} as const;

export type ConfigKey = keyof typeof CONFIG;