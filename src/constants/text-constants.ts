export const TEXT = {
  // Error messages
  ERROR_UNKNOWN_SECRET: 'Secret not found',
  ERROR_FORBIDDEN_DOMAIN: 'Domain not allowed by policy',
  ERROR_FORBIDDEN_ACTION: 'Action not allowed by policy',
  ERROR_TTL_EXPIRED: 'Secret has expired',
  ERROR_RATE_LIMITED: 'Rate limit exceeded',
  ERROR_PAYLOAD_TOO_LARGE: 'Payload size exceeds limit',
  ERROR_MISSING_ENV: 'Environment variable not set',
  ERROR_TIMEOUT: 'Request timed out',
  ERROR_INVALID_REQUEST: 'Invalid request format',
  ERROR_POLICY_NOT_FOUND: 'Policy not found for secret',
  ERROR_POLICY_EXPIRED: 'Policy has expired',
  ERROR_NO_MAPPING: 'No mapping found for secret',
  ERROR_INVALID_ACTION: 'Invalid action format',
  ERROR_INVALID_DOMAIN: 'Invalid domain format',
  ERROR_INVALID_CONFIG: 'Invalid configuration',
  ERROR_DUPLICATE_SECRET_ID: 'Duplicate secret ID',
  ERROR_INVALID_SECRET_ID_FORMAT: 'Invalid secret ID format',
  ERROR_INVALID_ENV_VAR_FORMAT: 'Invalid environment variable format',
  ERROR_SECRET_ID_TOO_LONG: 'Secret ID exceeds maximum length',
  ERROR_SECRET_ID_TOO_SHORT: 'Secret ID is too short',
  ERROR_ENV_VAR_TOO_SHORT: 'Environment variable name is too short',
  ERROR_INVALID_POLICY_STRUCTURE: 'Invalid policy structure',
  ERROR_MISSING_POLICY_FIELD: 'Required policy field missing',
  ERROR_INVALID_ALLOWED_ACTIONS: 'Invalid allowed actions',
  ERROR_INVALID_ALLOWED_DOMAINS: 'Invalid allowed domains',
  ERROR_INVALID_RATE_LIMIT: 'Invalid rate limit configuration',
  ERROR_INVALID_EXPIRATION: 'Invalid expiration date',
  ERROR_EMPTY_ALLOWED_ACTIONS: 'Allowed actions cannot be empty',
  ERROR_EMPTY_ALLOWED_DOMAINS: 'Allowed domains cannot be empty',
  ERROR_DUPLICATE_POLICY: 'Duplicate policy for secret ID',
  ERROR_UNSUPPORTED_ACTION: 'Unsupported action',
  ERROR_POLICIES_NOT_LOADED: 'Policies not loaded',
  ERROR_NETWORK_ERROR: 'Network request failed',
  ERROR_EMPTY_HEADER_NAME: 'Header name cannot be empty',
  ERROR_UNKNOWN_TOOL: 'Unknown tool requested',
  ERROR_TOOL_EXECUTION_FAILED: 'Tool execution failed',
  ERROR_INVALID_METHOD: 'Invalid HTTP method',
  ERROR_INVALID_INJECTION_TYPE: 'Invalid injection type',
  ERROR_INVALID_URL: 'Invalid URL format',
  ERROR_INVALID_HEADERS: 'Invalid headers format',
  ERROR_EXECUTION_FAILED: 'Execution failed',
  
  // Success messages
  SUCCESS_REQUEST_COMPLETED: 'Request completed successfully',
  SUCCESS_POLICY_LOADED: 'Policy loaded successfully',
  SUCCESS_AUDIT_WRITTEN: 'Audit entry written',
  
  // Field names
  FIELD_SECRET_ID: 'secretId',
  FIELD_ACTION: 'action',
  FIELD_DOMAIN: 'domain',
  FIELD_TIMESTAMP: 'timestamp',
  FIELD_OUTCOME: 'outcome',
  FIELD_REASON: 'reason',
  FIELD_ENV_VAR: 'envVar',
  FIELD_ALLOWED_ACTIONS: 'allowedActions',
  FIELD_ALLOWED_DOMAINS: 'allowedDomains',
  FIELD_RATE_LIMIT: 'rateLimit',
  FIELD_EXPIRES_AT: 'expiresAt',
  FIELD_REQUESTS: 'requests',
  FIELD_WINDOW_SECONDS: 'windowSeconds',
  FIELD_METHOD: 'method',
  FIELD_PAGE: 'page',
  FIELD_PAGE_SIZE: 'pageSize',
  FIELD_TOTAL_COUNT: 'totalCount',
  FIELD_HAS_MORE: 'hasMore',
  FIELD_START_TIME: 'startTime',
  FIELD_END_TIME: 'endTime',
  FIELD_SECRETS: 'secrets',
  FIELD_AVAILABLE: 'available',
  FIELD_DESCRIPTION: 'description',
  FIELD_ERROR: 'error',
  FIELD_CODE: 'code',
  FIELD_MESSAGE: 'message',
  
  // Log messages
  LOG_SERVER_STARTED: 'MCP server started',
  LOG_SERVER_STOPPED: 'MCP server stopped',
  LOG_PROCESSING_REQUEST: 'Processing request',
  LOG_REQUEST_DENIED: 'Request denied',
  LOG_REQUEST_ALLOWED: 'Request allowed',
  LOG_LOADING_POLICIES: 'Loading policies',
  LOG_LOADING_MAPPINGS: 'Loading ENV mappings',
  
  // Audit outcomes
  AUDIT_OUTCOME_SUCCESS: 'success',
  AUDIT_OUTCOME_DENIED: 'denied',
  AUDIT_OUTCOME_ERROR: 'error',
  
  // HTTP methods
  HTTP_METHOD_GET: 'http_get',
  HTTP_METHOD_POST: 'http_post',
  HTTP_VERB_GET: 'GET',
  HTTP_VERB_POST: 'POST',
  
  // Injection types
  INJECTION_TYPE_BEARER: 'bearer',
  INJECTION_TYPE_HEADER: 'header',
  
  // Response messages
  RESPONSE_NO_SECRETS: 'No secrets configured',
  RESPONSE_POLICY_DESCRIPTION: 'Policy for secret',
  RESPONSE_AUDIT_ENTRIES: 'Audit entries',
  
  // Validation messages
  VALIDATION_REQUIRED_FIELD: 'Required field missing',
  VALIDATION_INVALID_TYPE: 'Invalid field type',
  VALIDATION_INVALID_FORMAT: 'Invalid format',
  
  // Tool names
  TOOL_DISCOVER: 'discover_secrets',
  TOOL_DESCRIBE: 'describe_policy',
  TOOL_USE: 'use_secret',
  TOOL_AUDIT: 'query_audit',
  
  // Tool descriptions
  TOOL_DESC_DISCOVER: 'List available secrets',
  TOOL_DESC_DESCRIBE: 'Get policy details for a secret',
  TOOL_DESC_USE: 'Use a secret to perform an action',
  TOOL_DESC_AUDIT: 'Query audit log entries',
  TOOL_DISCOVER_DESCRIPTION: 'List all available secret identifiers and their metadata',
  
  // Input field descriptions
  INPUT_DESC_SECRET_ID: 'The ID of the secret to describe policy for',
  INPUT_DESC_USE_SECRET_ID: 'The ID of the secret to use',
  INPUT_DESC_ACTION: 'The action to perform with the secret',
  INPUT_DESC_ACTION_TYPE: 'The type of action to perform',
  INPUT_DESC_ACTION_URL: 'The URL to make the request to',
  INPUT_DESC_ACTION_HEADERS: 'Optional headers for the request',
  INPUT_DESC_ACTION_BODY: 'Optional body for POST requests',
  INPUT_DESC_INJECTION_TYPE: 'How to inject the secret (bearer or header)',
  
  // Schema types
  SCHEMA_TYPE_OBJECT: 'object',
  SCHEMA_TYPE_STRING: 'string',
  
  // Schema field names (JSON Schema standard keywords)
  SCHEMA_PROPERTIES: 'properties',
  SCHEMA_REQUIRED: 'required',
  SCHEMA_TYPE: 'type',
  
  // Field values
  FIELD_VALUE_UNKNOWN: 'unknown',
  FIELD_VALUE_INVALID: 'invalid'
} as const;

export type TextKey = keyof typeof TEXT;