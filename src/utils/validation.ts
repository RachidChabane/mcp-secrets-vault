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