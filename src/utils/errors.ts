import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';

export class VaultError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VaultError';
    Object.setPrototypeOf(this, VaultError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context
    };
  }
}

export class ValidationError extends VaultError {
  constructor(code: string, message: string, field?: string) {
    const context = field ? { field } : undefined;
    super(code, message, context);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class ConfigurationError extends VaultError {
  constructor(message: string, field?: string) {
    const context = field ? { field } : undefined;
    super(CONFIG.ERROR_CODE_INVALID_REQUEST, message, context);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export class SecretNotFoundError extends VaultError {
  constructor(secretId: string) {
    super(
      CONFIG.ERROR_CODE_UNKNOWN_SECRET,
      TEXT.ERROR_UNKNOWN_SECRET,
      { secretId }
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