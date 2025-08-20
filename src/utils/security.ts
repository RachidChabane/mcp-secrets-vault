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
/**
 * Apply basic redaction patterns
 */
function applyBasicRedaction(text: string): string {
  return text
    .replace(CONFIG.REDACT_URL_AUTH_PATTERN, CONFIG.SANITIZE_REPLACEMENT)
    .replace(CONFIG.REDACT_JWT_PATTERN, CONFIG.SANITIZE_REPLACEMENT)
    .replace(CONFIG.REDACT_BEARER_TOKEN_PATTERN, CONFIG.SANITIZE_REPLACEMENT)
    .replace(CONFIG.REDACT_ENV_VAR_PATTERN, CONFIG.SANITIZE_REPLACEMENT)
    .replace(CONFIG.REDACT_KEY_VALUE_PATTERN, (_match, key) => `${key}=${CONFIG.SANITIZE_REPLACEMENT}`);
}

/**
 * Apply API key pattern redaction
 */
function applyApiKeyRedaction(text: string): string {
  let result = text;
  for (const pattern of CONFIG.REDACT_API_KEY_PATTERNS) {
    result = result.replace(pattern, CONFIG.SANITIZE_REPLACEMENT);
  }
  return result;
}

/**
 * Apply token pattern redaction for long strings
 */
function applyTokenRedaction(text: string): string {
  return text.replace(/\b[a-zA-Z0-9_-]{32,}\b/g, (match) => {
    if (/^[a-zA-Z]+$/.test(match)) return match;
    if (/[a-zA-Z]/.test(match) && /[0-9_-]/.test(match)) {
      return CONFIG.SANITIZE_REPLACEMENT;
    }
    return match;
  });
}

export function redactSensitiveValue(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  
  let redacted = applyBasicRedaction(value);
  redacted = applyApiKeyRedaction(redacted);
  redacted = applyTokenRedaction(redacted);
  
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
/**
 * Check if an object key is sensitive
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  // secretId and secrets (array of secret info) are not sensitive - they're just identifiers
  if (lowerKey === 'secretid' || lowerKey === 'secret_id' || lowerKey === 'secrets') {
    return false;
  }
  return CONFIG.SENSITIVE_FIELD_NAMES.some(sensitive => 
    lowerKey === sensitive || lowerKey.includes(sensitive)
  );
}

/**
 * Sanitize object properties
 */
function sanitizeObjectProperties(obj: Record<string, unknown>, maxDepth: number): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = CONFIG.SANITIZE_REPLACEMENT;
    } else if (key === 'url' && typeof value === 'string') {
      sanitized[key] = sanitizeUrl(value);
    } else {
      sanitized[key] = deepSanitizeObject(value, maxDepth - 1);
    }
  }
  
  return sanitized;
}

export function deepSanitizeObject<T>(obj: T, maxDepth: number = 10): T {
  if (maxDepth <= 0 || obj === null || obj === undefined) {
    return maxDepth <= 0 ? CONFIG.SANITIZE_REPLACEMENT as unknown as T : obj;
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
    return sanitizeObjectProperties(obj as Record<string, unknown>, maxDepth) as T;
  }
  
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
/**
 * Check string for sensitive patterns
 */
function checkStringPatterns(text: string, path: string): string[] {
  const violations: string[] = [];
  
  if (CONFIG.REDACT_JWT_PATTERN.test(text)) {
    violations.push(`${path}: Contains JWT token`);
  }
  if (CONFIG.REDACT_ENV_VAR_PATTERN.test(text)) {
    violations.push(`${path}: Contains environment variable pattern`);
  }
  
  const tokenMatch = text.match(/\b[a-zA-Z0-9_-]{32,}\b/);
  if (tokenMatch && !/^[a-zA-Z]+$/.test(tokenMatch[0])) {
    violations.push(`${path}: Contains potential secret token`);
  }
  
  return violations;
}

/**
 * Check object properties for sensitive fields
 */
function checkObjectProperties(obj: Record<string, unknown>, path: string): string[] {
  const violations: string[] = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const currentPath = path ? `${path}.${key}` : key;
    
    if (CONFIG.SENSITIVE_FIELD_NAMES.some(sensitive => 
      lowerKey === sensitive || lowerKey.includes(sensitive)
    )) {
      if (value && value !== CONFIG.SANITIZE_REPLACEMENT) {
        violations.push(`${currentPath}: Sensitive field not redacted`);
      }
    }
    
    violations.push(...containsSensitiveData(value, currentPath));
  }
  
  return violations;
}

export function containsSensitiveData(obj: unknown, path: string = ''): string[] {
  if (obj === null || obj === undefined) return [];
  
  if (typeof obj === 'string') {
    return checkStringPatterns(obj, path);
  }
  
  if (Array.isArray(obj)) {
    const violations: string[] = [];
    obj.forEach((item, index) => {
      violations.push(...containsSensitiveData(item, `${path}[${index}]`));
    });
    return violations;
  }
  
  if (typeof obj === 'object') {
    return checkObjectProperties(obj as Record<string, unknown>, path);
  }
  
  return [];
}