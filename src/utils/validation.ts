import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { ValidationError } from './errors.js';

export function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateSecretId(secretId: string): string {
  const trimmed = secretId.trim();
  
  if (trimmed.length < CONFIG.MIN_SECRET_ID_LENGTH) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_SECRET_ID_TOO_SHORT,
      TEXT.FIELD_SECRET_ID
    );
  }
  
  if (trimmed.length > CONFIG.MAX_SECRET_ID_LENGTH) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_SECRET_ID_TOO_LONG,
      TEXT.FIELD_SECRET_ID
    );
  }
  
  if (!CONFIG.SECRET_ID_REGEX.test(trimmed)) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_INVALID_SECRET_ID_FORMAT,
      TEXT.FIELD_SECRET_ID
    );
  }
  
  return trimmed;
}

export function validateEnvVar(envVar: string): string {
  const trimmed = envVar.trim();
  
  if (trimmed.length < CONFIG.MIN_ENV_VAR_LENGTH) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_ENV_VAR_TOO_SHORT,
      TEXT.FIELD_ENV_VAR
    );
  }
  
  if (!CONFIG.ENV_VAR_REGEX.test(trimmed)) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_INVALID_ENV_VAR_FORMAT,
      TEXT.FIELD_ENV_VAR
    );
  }
  
  return trimmed;
}

export function sanitizeForLog(value: string): string {
  return value.replace(CONFIG.SANITIZE_SECRET_PATTERN, CONFIG.SANITIZE_REPLACEMENT);
}

export function validateDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  
  if (trimmed.length < CONFIG.MIN_DOMAIN_LENGTH) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_DOMAIN_TOO_SHORT,
      TEXT.FIELD_DOMAIN
    );
  }
  
  if (trimmed.length > CONFIG.MAX_DOMAIN_LENGTH) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_DOMAIN_TOO_LONG,
      TEXT.FIELD_DOMAIN
    );
  }
  
  if (!CONFIG.DOMAIN_REGEX.test(trimmed)) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_INVALID_DOMAIN_FORMAT,
      TEXT.FIELD_DOMAIN
    );
  }
  
  return trimmed;
}

export function validateUrl(url: string): string {
  const trimmed = url.trim();
  
  if (trimmed.length > CONFIG.MAX_URL_LENGTH) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_URL_TOO_LONG,
      TEXT.FIELD_URL
    );
  }
  
  // Try to parse URL
  let urlObj: URL;
  try {
    urlObj = new URL(trimmed);
  } catch {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_INVALID_URL,
      TEXT.FIELD_URL
    );
  }
  
  // Enforce HTTPS if required
  if (CONFIG.DEFAULT_REQUIRE_HTTPS && urlObj.protocol !== 'https:') {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_HTTPS_REQUIRED,
      TEXT.FIELD_URL
    );
  }
  
  // Validate against URL regex
  if (!CONFIG.URL_REGEX.test(trimmed)) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_INVALID_URL_FORMAT,
      TEXT.FIELD_URL
    );
  }
  
  // Strip authentication info for security
  urlObj.username = '';
  urlObj.password = '';
  
  return urlObj.toString();
}

export function validateAction(action: string): string {
  const trimmed = action.trim().toLowerCase();
  
  if (trimmed.length > CONFIG.MAX_ACTION_LENGTH) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_ACTION_TOO_LONG,
      TEXT.FIELD_ACTION
    );
  }
  
  if (!CONFIG.ACTION_REGEX.test(trimmed)) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_INVALID_ACTION_FORMAT,
      TEXT.FIELD_ACTION
    );
  }
  
  // Check if action is in supported list
  if (!CONFIG.SUPPORTED_ACTIONS.includes(trimmed as any)) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_FORBIDDEN_ACTION,
      TEXT.ERROR_FORBIDDEN_ACTION,
      TEXT.FIELD_ACTION
    );
  }
  
  return trimmed;
}

export function validateHeaderName(name: string): string {
  const trimmed = name.trim();
  
  if (trimmed.length === 0) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_EMPTY_HEADER_NAME,
      TEXT.FIELD_HEADER_NAME
    );
  }
  
  if (trimmed.length > CONFIG.MAX_HEADER_NAME_LENGTH) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_HEADER_NAME_TOO_LONG,
      TEXT.FIELD_HEADER_NAME
    );
  }
  
  if (!CONFIG.HEADER_NAME_REGEX.test(trimmed)) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_INVALID_HEADER_NAME_FORMAT,
      TEXT.FIELD_HEADER_NAME
    );
  }
  
  return trimmed;
}

export function validateHeaderValue(value: string): string {
  const trimmed = value.trim();
  
  if (trimmed.length > CONFIG.MAX_HEADER_VALUE_LENGTH) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      TEXT.ERROR_HEADER_VALUE_TOO_LONG,
      TEXT.FIELD_HEADER_VALUE
    );
  }
  
  // Remove any control characters
  const sanitized = trimmed.replace(/[\x00-\x1F\x7F]/g, '');
  
  return sanitized;
}

/**
 * Validate and sanitize all string inputs
 * Central function for input validation
 */
export function validateAndSanitizeInput(
  value: unknown,
  fieldName: string,
  validator?: (val: string) => string
): string {
  if (!isNonEmptyString(value)) {
    throw new ValidationError(
      CONFIG.ERROR_CODE_INVALID_REQUEST,
      `${fieldName} must be a non-empty string`,
      fieldName
    );
  }
  
  const stringValue = String(value).trim();
  
  // Apply custom validator if provided
  if (validator) {
    return validator(stringValue);
  }
  
  return stringValue;
}