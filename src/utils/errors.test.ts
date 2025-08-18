import { describe, expect, it } from 'vitest';
import {
  VaultError,
  ValidationError,
  ConfigurationError,
  SecretNotFoundError,
  ToolError,
} from './errors.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';

describe('VaultError', () => {
  it('should create error with code, message and context', () => {
    const error = new VaultError('TEST_CODE', 'Test message', { foo: 'bar' });
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VaultError);
    expect(error.name).toBe('VaultError');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.context).toEqual({ foo: 'bar' });
  });

  it('should create error without context', () => {
    const error = new VaultError('TEST_CODE', 'Test message');
    
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.context).toBeUndefined();
  });

  it('should serialize to JSON correctly', () => {
    const error = new VaultError('TEST_CODE', 'Test message', { foo: 'bar' });
    const json = error.toJSON();
    
    expect(json).toEqual({
      name: 'VaultError',
      code: 'TEST_CODE',
      message: 'Test message',
      context: { foo: 'bar' }
    });
  });

  it('should serialize to JSON without context', () => {
    const error = new VaultError('TEST_CODE', 'Test message');
    const json = error.toJSON();
    
    expect(json).toEqual({
      name: 'VaultError',
      code: 'TEST_CODE',
      message: 'Test message',
      context: undefined
    });
  });

  it('should maintain proper prototype chain', () => {
    const error = new VaultError('TEST_CODE', 'Test message');
    
    expect(error instanceof Error).toBe(true);
    expect(error instanceof VaultError).toBe(true);
    expect(Object.getPrototypeOf(error)).toBe(VaultError.prototype);
  });
});

describe('ValidationError', () => {
  it('should create error with field', () => {
    const error = new ValidationError('VALIDATION_ERROR', 'Invalid field', 'username');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VaultError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid field');
    expect(error.context).toEqual({ field: 'username' });
  });

  it('should create error without field', () => {
    const error = new ValidationError('VALIDATION_ERROR', 'Invalid data');
    
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid data');
    expect(error.context).toBeUndefined();
  });

  it('should serialize to JSON with field', () => {
    const error = new ValidationError('VALIDATION_ERROR', 'Invalid field', 'email');
    const json = error.toJSON();
    
    expect(json).toEqual({
      name: 'ValidationError',
      code: 'VALIDATION_ERROR',
      message: 'Invalid field',
      context: { field: 'email' }
    });
  });

  it('should maintain proper prototype chain', () => {
    const error = new ValidationError('VALIDATION_ERROR', 'Invalid data');
    
    expect(error instanceof Error).toBe(true);
    expect(error instanceof VaultError).toBe(true);
    expect(error instanceof ValidationError).toBe(true);
    expect(Object.getPrototypeOf(error)).toBe(ValidationError.prototype);
  });
});

describe('ConfigurationError', () => {
  it('should create error with field', () => {
    const error = new ConfigurationError('Invalid configuration', 'configFile');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VaultError);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.name).toBe('ConfigurationError');
    expect(error.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
    expect(error.message).toBe('Invalid configuration');
    expect(error.context).toEqual({ field: 'configFile' });
  });

  it('should create error without field', () => {
    const error = new ConfigurationError('Invalid configuration');
    
    expect(error.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
    expect(error.message).toBe('Invalid configuration');
    expect(error.context).toBeUndefined();
  });

  it('should always use INVALID_REQUEST error code', () => {
    const error = new ConfigurationError('Any message', 'anyField');
    
    expect(error.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
  });

  it('should serialize to JSON correctly', () => {
    const error = new ConfigurationError('Config error', 'database');
    const json = error.toJSON();
    
    expect(json).toEqual({
      name: 'ConfigurationError',
      code: CONFIG.ERROR_CODE_INVALID_REQUEST,
      message: 'Config error',
      context: { field: 'database' }
    });
  });

  it('should maintain proper prototype chain', () => {
    const error = new ConfigurationError('Config error');
    
    expect(error instanceof Error).toBe(true);
    expect(error instanceof VaultError).toBe(true);
    expect(error instanceof ConfigurationError).toBe(true);
    expect(Object.getPrototypeOf(error)).toBe(ConfigurationError.prototype);
  });
});

describe('SecretNotFoundError', () => {
  it('should create error with secretId', () => {
    const error = new SecretNotFoundError('SECRET_123');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VaultError);
    expect(error).toBeInstanceOf(SecretNotFoundError);
    expect(error.name).toBe('SecretNotFoundError');
    expect(error.code).toBe(CONFIG.ERROR_CODE_UNKNOWN_SECRET);
    expect(error.message).toBe(TEXT.ERROR_UNKNOWN_SECRET);
    expect(error.context).toEqual({ secretId: 'SECRET_123' });
  });

  it('should always use standard error code and message', () => {
    const error = new SecretNotFoundError('ANY_SECRET');
    
    expect(error.code).toBe(CONFIG.ERROR_CODE_UNKNOWN_SECRET);
    expect(error.message).toBe(TEXT.ERROR_UNKNOWN_SECRET);
  });

  it('should serialize to JSON correctly', () => {
    const error = new SecretNotFoundError('MY_SECRET');
    const json = error.toJSON();
    
    expect(json).toEqual({
      name: 'SecretNotFoundError',
      code: CONFIG.ERROR_CODE_UNKNOWN_SECRET,
      message: TEXT.ERROR_UNKNOWN_SECRET,
      context: { secretId: 'MY_SECRET' }
    });
  });

  it('should maintain proper prototype chain', () => {
    const error = new SecretNotFoundError('SECRET');
    
    expect(error instanceof Error).toBe(true);
    expect(error instanceof VaultError).toBe(true);
    expect(error instanceof SecretNotFoundError).toBe(true);
    expect(Object.getPrototypeOf(error)).toBe(SecretNotFoundError.prototype);
  });

  it('should handle empty secretId', () => {
    const error = new SecretNotFoundError('');
    
    expect(error.context).toEqual({ secretId: '' });
  });
});

describe('ToolError', () => {
  it('should create error with message and code', () => {
    const error = new ToolError('Tool failed', 'TOOL_ERROR');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VaultError);
    expect(error).toBeInstanceOf(ToolError);
    expect(error.name).toBe('ToolError');
    expect(error.code).toBe('TOOL_ERROR');
    expect(error.message).toBe('Tool failed');
    expect(error.context).toBeUndefined();
  });

  it('should not have context', () => {
    const error = new ToolError('Any message', 'ANY_CODE');
    
    expect(error.context).toBeUndefined();
  });

  it('should serialize to JSON correctly', () => {
    const error = new ToolError('Execution failed', 'EXEC_ERROR');
    const json = error.toJSON();
    
    expect(json).toEqual({
      name: 'ToolError',
      code: 'EXEC_ERROR',
      message: 'Execution failed',
      context: undefined
    });
  });

  it('should maintain proper prototype chain', () => {
    const error = new ToolError('Tool error', 'CODE');
    
    expect(error instanceof Error).toBe(true);
    expect(error instanceof VaultError).toBe(true);
    expect(error instanceof ToolError).toBe(true);
    expect(Object.getPrototypeOf(error)).toBe(ToolError.prototype);
  });

  it('should handle various error codes', () => {
    const error1 = new ToolError('Message 1', CONFIG.ERROR_CODE_UNKNOWN_TOOL);
    const error2 = new ToolError('Message 2', CONFIG.ERROR_CODE_TIMEOUT);
    
    expect(error1.code).toBe(CONFIG.ERROR_CODE_UNKNOWN_TOOL);
    expect(error2.code).toBe(CONFIG.ERROR_CODE_TIMEOUT);
  });
});

describe('Error inheritance', () => {
  it('should allow catching by base class', () => {
    const errors = [
      new ValidationError('VAL_ERROR', 'Validation'),
      new ConfigurationError('Config'),
      new SecretNotFoundError('SECRET'),
      new ToolError('Tool', 'TOOL_ERROR'),
    ];

    errors.forEach(error => {
      expect(error instanceof VaultError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  it('should have distinct name properties', () => {
    const errors = [
      new VaultError('CODE', 'Message'),
      new ValidationError('CODE', 'Message'),
      new ConfigurationError('Message'),
      new SecretNotFoundError('SECRET'),
      new ToolError('Message', 'CODE'),
    ];

    expect(errors[0]!.name).toBe('VaultError');
    expect(errors[1]!.name).toBe('ValidationError');
    expect(errors[2]!.name).toBe('ConfigurationError');
    expect(errors[3]!.name).toBe('SecretNotFoundError');
    expect(errors[4]!.name).toBe('ToolError');
  });
});