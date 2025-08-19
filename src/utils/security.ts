import { CONFIG } from '../constants/config-constants.js';

/**
 * Security utilities for sanitization and redaction
 */

/**
 * Truncate text if it exceeds max length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + CONFIG.RESPONSE_TRUNCATION_MESSAGE;
}

/**
 * Comprehensive redaction of sensitive values from strings
 * Uses multiple patterns for defense in depth
 */
export function redactSensitiveValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  
  let redacted = value;
  
  // Redact URLs with authentication
  redacted = redacted.replace(
    CONFIG.REDACT_URL_AUTH_PATTERN,
    CONFIG.SANITIZE_REPLACEMENT
  );
  
  // Redact JWT tokens
  redacted = redacted.replace(
    CONFIG.REDACT_JWT_PATTERN,
    CONFIG.SANITIZE_REPLACEMENT
  );
  
  // Redact Bearer tokens
  redacted = redacted.replace(
    CONFIG.REDACT_BEARER_TOKEN_PATTERN,
    CONFIG.SANITIZE_REPLACEMENT
  );
  
  // Redact environment variable patterns
  redacted = redacted.replace(
    CONFIG.REDACT_ENV_VAR_PATTERN,
    CONFIG.SANITIZE_REPLACEMENT
  );
  
  // Redact key=value patterns with sensitive keys
  redacted = redacted.replace(
    CONFIG.REDACT_KEY_VALUE_PATTERN,
    (_match, key) => `${key}=${CONFIG.SANITIZE_REPLACEMENT}`
  );
  
  // Apply API key patterns
  for (const pattern of CONFIG.REDACT_API_KEY_PATTERNS) {
    redacted = redacted.replace(pattern, CONFIG.SANITIZE_REPLACEMENT);
  }
  
  // Redact any remaining long alphanumeric tokens
  redacted = redacted.replace(
    /\b[a-zA-Z0-9_-]{32,}\b/g,
    (match) => {
      // Don't redact if it looks like a regular word
      if (/^[a-zA-Z]+$/.test(match)) {
        return match;
      }
      // Check if it contains mixed characters (likely a token)
      if (/[a-zA-Z]/.test(match) && /[0-9_-]/.test(match)) {
        return CONFIG.SANITIZE_REPLACEMENT;
      }
      return match;
    }
  );
  
  return redacted;
}

/**
 * Truncate and redact text for safe output
 */
export function sanitizeForOutput(
  text: string, 
  maxLength: number = CONFIG.RESPONSE_MAX_BODY_LENGTH
): string {
  const truncated = truncateText(text, maxLength);
  return redactSensitiveValue(truncated);
}

/**
 * Strip authentication from URLs
 */
export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove authentication info
    urlObj.username = '';
    urlObj.password = '';
    // Remove any auth query parameters
    const params = urlObj.searchParams;
    for (const key of Array.from(params.keys())) {
      if (CONFIG.SANITIZE_SECRET_PATTERN.test(key)) {
        params.set(key, CONFIG.SANITIZE_REPLACEMENT);
      }
    }
    return urlObj.toString();
  } catch {
    // If not a valid URL, redact the whole thing to be safe
    return redactSensitiveValue(url);
  }
}

/**
 * Deep sanitize objects recursively
 * Ensures no sensitive data in nested structures
 */
export function deepSanitizeObject<T>(obj: T, maxDepth: number = 10): T {
  if (maxDepth <= 0) {
    return CONFIG.SANITIZE_REPLACEMENT as unknown as T;
  }
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return redactSensitiveValue(obj) as unknown as T;
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitizeObject(item, maxDepth - 1)) as unknown as T;
  }
  
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Check if key is sensitive
      if (CONFIG.SENSITIVE_FIELD_NAMES.some(sensitive => 
        lowerKey === sensitive || lowerKey.includes(sensitive)
      )) {
        sanitized[key] = CONFIG.SANITIZE_REPLACEMENT;
      } else if (key === 'url' && typeof value === 'string') {
        // Special handling for URL fields
        sanitized[key] = sanitizeUrl(value);
      } else {
        sanitized[key] = deepSanitizeObject(value, maxDepth - 1);
      }
    }
    
    return sanitized as T;
  }
  
  // For functions and other types, replace with placeholder
  return CONFIG.SANITIZE_REPLACEMENT as unknown as T;
}

/**
 * Make an object deeply immutable
 * Prevents any modification to ensure security
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  // Primitive values are already immutable
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  // Freeze the object itself
  Object.freeze(obj);
  
  // Recursively freeze all properties
  Object.getOwnPropertyNames(obj).forEach(prop => {
    const value = (obj as any)[prop];
    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  });
  
  return obj as Readonly<T>;
}

/**
 * Sanitize error messages for safe output
 */
export function sanitizeError(error: unknown): string {
  // Check if it's an Error-like object by looking for message property
  const err = error as any;
  
  // Never expose stack traces
  if (err?.stack) {
    // Only take the first line (error message) and sanitize it
    const firstLine = String(err.stack).split('\n')[0] || '';
    return redactSensitiveValue(firstLine);
  }
  
  if (err?.message && typeof err.message === 'string') {
    return redactSensitiveValue(err.message);
  }
  
  if (typeof error === 'string') {
    return redactSensitiveValue(error);
  }
  
  // For unknown error types, don't risk exposing anything
  return CONFIG.SANITIZE_REPLACEMENT;
}

/**
 * Filter headers against allowlist and redact values
 */
export function sanitizeHeaders(
  headers: Headers | Record<string, string>,
  allowedHeaders: Set<string>
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  
  const processHeader = (value: string, key: string) => {
    const normalizedKey = key.toLowerCase();
    if (allowedHeaders.has(normalizedKey)) {
      // Normalize the key to lowercase for deterministic output
      sanitized[normalizedKey] = redactSensitiveValue(value);
    }
  };
  
  // Check if it's a Headers object by looking for the forEach method
  const h = headers as any;
  if (h?.forEach && typeof h.forEach === 'function') {
    h.forEach(processHeader);
  } else {
    Object.entries(headers).forEach(([key, value]) => {
      processHeader(value, key);
    });
  }
  
  return sanitized;
}

/**
 * Check if a string is empty or only whitespace
 */
export function isEmptyOrWhitespace(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

/**
 * Create a sanitized copy of an object with immutability
 * Combines deep sanitization and freezing for maximum security
 */
export function createSanitizedImmutableCopy<T>(obj: T): Readonly<T> {
  const sanitized = deepSanitizeObject(obj);
  return deepFreeze(sanitized);
}

/**
 * Sanitize a response object for safe output
 * Ensures no sensitive data and immutability
 */
export function sanitizeResponse<T>(response: T): Readonly<T> {
  // First deep sanitize to remove any sensitive data
  const sanitized = deepSanitizeObject(response);
  
  // Then make it immutable to prevent tampering
  return deepFreeze(sanitized);
}

/**
 * Validate that an object contains no sensitive fields
 * Used for security invariant testing
 */
export function containsSensitiveData(obj: unknown, path: string = ''): string[] {
  const violations: string[] = [];
  
  if (obj === null || obj === undefined) {
    return violations;
  }
  
  if (typeof obj === 'string') {
    // Check for patterns that might indicate secrets
    if (CONFIG.REDACT_JWT_PATTERN.test(obj)) {
      violations.push(`${path}: Contains JWT token`);
    }
    if (CONFIG.REDACT_ENV_VAR_PATTERN.test(obj)) {
      violations.push(`${path}: Contains environment variable pattern`);
    }
    // Check for long tokens
    const tokenMatch = obj.match(/\b[a-zA-Z0-9_-]{32,}\b/);
    if (tokenMatch && !/^[a-zA-Z]+$/.test(tokenMatch[0])) {
      violations.push(`${path}: Contains potential secret token`);
    }
    return violations;
  }
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      violations.push(...containsSensitiveData(item, `${path}[${index}]`));
    });
    return violations;
  }
  
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check if key name is sensitive
      if (CONFIG.SENSITIVE_FIELD_NAMES.some(sensitive => 
        lowerKey === sensitive || lowerKey.includes(sensitive)
      )) {
        if (value && value !== CONFIG.SANITIZE_REPLACEMENT) {
          violations.push(`${currentPath}: Sensitive field not redacted`);
        }
      }
      
      // Recursively check value
      violations.push(...containsSensitiveData(value, currentPath));
    }
  }
  
  return violations;
}