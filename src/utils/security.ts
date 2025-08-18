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
 * Redact sensitive values from strings
 */
export function redactSensitiveValue(value: string): string {
  // Redact URLs with auth
  value = value.replace(
    /https?:\/\/[^:]+:[^@]+@[^\s]+/gi,
    CONFIG.SANITIZE_REPLACEMENT
  );
  
  // Redact key=value patterns with sensitive keys, preserving the key name
  value = value.replace(
    /(api[_-]?key|secret|token|password|auth|bearer)\s*=\s*([^\s]+)/gi,
    (_match, key) => `${key}=${CONFIG.SANITIZE_REPLACEMENT}`
  );
  
  // Redact standalone tokens that look like secrets
  value = value.replace(
    /\b[a-zA-Z0-9_-]{20,}\b/g,
    (match) => {
      // Don't redact if it looks like a regular word or is too short
      if (match.length < 20 || /^[a-zA-Z]+$/.test(match)) {
        return match;
      }
      // Check if it contains both letters and numbers/special chars (likely a token)
      if (/[a-zA-Z]/.test(match) && /[0-9_-]/.test(match)) {
        return CONFIG.SANITIZE_REPLACEMENT;
      }
      return match;
    }
  );
  
  return value;
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
 * Sanitize error messages for safe output
 */
export function sanitizeError(error: unknown): string {
  // Check if it's an Error-like object by looking for message property
  const err = error as any;
  if (err?.message && typeof err.message === 'string') {
    return redactSensitiveValue(err.message);
  }
  if (typeof error === 'string') {
    return redactSensitiveValue(error);
  }
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