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
  
  // Sanitization
  SANITIZE_AUTH_HEADER_PATTERN: /authorization/i,
  SANITIZE_SECRET_PATTERN: /(api[_-]?key|secret|token|password|auth|bearer)/i,
  SANITIZE_REPLACEMENT: '[REDACTED]',
  
  // Validation
  MAX_SECRET_ID_LENGTH: 100,
  MAX_DOMAIN_LENGTH: 253,
  MAX_ACTION_LENGTH: 50,
  MAX_REASON_LENGTH: 500,
  
  // File paths
  DEFAULT_CONFIG_FILE: 'vault.config.json',
  DEFAULT_POLICIES_DIR: 'policies',
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
  ERROR_CODE_TTL_EXPIRED: 'ttl_expired',
  ERROR_CODE_RATE_LIMITED: 'rate_limited',
  ERROR_CODE_PAYLOAD_TOO_LARGE: 'payload_too_large',
  ERROR_CODE_MISSING_ENV: 'missing_env',
  ERROR_CODE_TIMEOUT: 'timeout',
  ERROR_CODE_INVALID_REQUEST: 'invalid_request',
  
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
  
  // Default values
  DEFAULT_TIMEZONE: 'UTC',
  DEFAULT_ENCODING: 'utf-8',
  
  // Environment variable prefix
  ENV_PREFIX: 'MCP_VAULT_',
  
  // Exit codes
  EXIT_CODE_SUCCESS: 0,
  EXIT_CODE_ERROR: 1,
  EXIT_CODE_INVALID_CONFIG: 2,
  EXIT_CODE_MISSING_DEPENDENCY: 3
} as const;

export type ConfigKey = keyof typeof CONFIG;