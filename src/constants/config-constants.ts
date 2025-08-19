export const CONFIG = {
  // Version
  VERSION: '0.1.0',
  
  // Server settings
  SERVER_NAME: 'mcp-secrets-vault',
  SERVER_VERSION: '0.1.0',
  PROTOCOL_VERSION: '1.0.0',
  
  // HTTP settings
  HTTP_TIMEOUT_MS: 30000,
  HTTP_MAX_REDIRECTS: 5,
  HTTP_DEFAULT_USER_AGENT: 'MCP-Secrets-Vault/0.1.0',
  
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
  SANITIZE_SECRET_PATTERN: /(api[_-]?key|secret|token|password|auth|bearer|credential|private[_-]?key|access[_-]?key)/i,
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
  REDACT_ENV_VAR_PATTERN: /\b[A-Z][A-Z0-9_]*_(KEY|SECRET|TOKEN|PASSWORD|API|CREDENTIAL)\b/gi,
  REDACT_KEY_VALUE_PATTERN: /(api[_-]?key|secret|token|password|auth|bearer|credential|private[_-]?key)\s*[:=]\s*[^\s,;}]+/gi,
  
  // Sensitive field names to always redact
  SENSITIVE_FIELD_NAMES: [
    'envvar',
    'env',
    'secret',
    'password',
    'token',
    'auth',
    'authorization',
    'bearer',
    'apikey',
    'api_key',
    'api-key',
    'secretvalue',
    'secret_value',
    'credential',
    'credentials',
    'private_key',
    'privatekey',
    'access_key',
    'accesskey',
    'client_secret',
    'clientsecret'
  ],
  
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
  URL_REGEX: /^https?:\/\/([\w\-]+\.)+[\w\-]+(\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?$/,
  HEADER_NAME_REGEX: /^[a-zA-Z0-9\-_]+$/,
  
  // File paths
  DEFAULT_CONFIG_FILE: 'vault.config.json',
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
  LINE_ENDING_PATTERN: /\r?\n/
} as const;

export type ConfigKey = keyof typeof CONFIG;