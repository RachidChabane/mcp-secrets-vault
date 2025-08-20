import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';
import { deepFreeze, deepSanitizeObject } from './security.js';

export class VaultError extends Error {
  public readonly code: string;
  public readonly context?: Readonly<Record<string, unknown>>;
  
  constructor(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    // Sanitize message to ensure no secrets
    const sanitizedMessage = typeof message === 'string' 
      ? message.replace(CONFIG.SANITIZE_SECRET_PATTERN, CONFIG.SANITIZE_REPLACEMENT)
      : String(message);
    
    super(sanitizedMessage);
    this.name = 'VaultError';
    this.code = code;
    
    // Sanitize and freeze context to prevent tampering
    if (context) {
      this.context = deepFreeze(deepSanitizeObject(context));
    }
    
    // Set prototype
    Object.setPrototypeOf(this, VaultError.prototype);
    // Don't freeze here - causes extensibility issues
  }

  toJSON(): Readonly<Record<string, unknown>> {
    const json = {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context
    };
    return deepFreeze(json);
  }
}

export class ValidationError extends VaultError {
  constructor(code: string, message: string, field?: string) {
    // Only include field name, never the value
    const context = field ? { field } : undefined;
    super(code, message, context);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class ConfigurationError extends VaultError {
  constructor(message: string, field?: string) {
    // Only include field name, never the value
    const context = field ? { field } : undefined;
    super(CONFIG.ERROR_CODE_INVALID_REQUEST, message, context);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export class SecretNotFoundError extends VaultError {
  constructor(secretId: string) {
    // Sanitize secretId length but preserve the value for debugging
    const sanitizedId = secretId.substring(0, CONFIG.MAX_SECRET_ID_LENGTH);
    super(
      CONFIG.ERROR_CODE_UNKNOWN_SECRET,
      TEXT.ERROR_UNKNOWN_SECRET,
      { secretId: sanitizedId }
    );
    this.name = 'SecretNotFoundError';
    Object.setPrototypeOf(this, SecretNotFoundError.prototype);
  }
}

export class ToolError extends VaultError {
  constructor(message: string, code: string) {
    super(code, message);
    this.name = 'ToolError';
    Object.setPrototypeOf(this, ToolError.prototype);
  }
}

/**
 * Create a sanitized error for external consumption
 * Ensures no sensitive data leaks through errors
 */
export function createSafeError(code: string, message: string, context?: Record<string, unknown>): VaultError {
  // Use TEXT constants for messages when possible
  const safeMessage = message || TEXT.ERROR_EXECUTION_FAILED;
  
  // Sanitize context to remove any sensitive fields
  const safeContext = context ? deepSanitizeObject(context) : undefined;
  
  return new VaultError(code, safeMessage, safeContext);
}

/**
 * Sanitize an unknown error for safe logging/output
 */
export function sanitizeUnknownError(error: unknown): VaultError {
  // Never expose raw error messages or stack traces
  if (error instanceof VaultError) {
    return error; // Already sanitized
  }
  
  if (error instanceof Error) {
    // Only use the error name, not the message
    return new VaultError(
      CONFIG.ERROR_CODE_EXECUTION_FAILED,
      TEXT.ERROR_EXECUTION_FAILED,
      { errorType: error.name }
    );
  }
  
  // For unknown error types, give generic error
  return new VaultError(
    CONFIG.ERROR_CODE_EXECUTION_FAILED,
    TEXT.ERROR_EXECUTION_FAILED
  );
}