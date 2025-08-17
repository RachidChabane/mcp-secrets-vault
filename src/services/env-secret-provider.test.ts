import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnvSecretProvider } from './env-secret-provider.js';
import { SecretMapping } from '../interfaces/secret-mapping.interface.js';
import { TEXT } from '../constants/text-constants.js';

describe('EnvSecretProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with valid mappings', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test_key', envVar: 'TEST_API_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider).toBeDefined();
    });

    it('should throw error for missing secretId', () => {
      const mappings: SecretMapping[] = [
        { secretId: '', envVar: 'TEST_API_KEY' }
      ];
      
      expect(() => new EnvSecretProvider(mappings))
        .toThrow(TEXT.VALIDATION_REQUIRED_FIELD);
    });

    it('should throw error for missing envVar', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test_key', envVar: '' }
      ];
      
      expect(() => new EnvSecretProvider(mappings))
        .toThrow(TEXT.VALIDATION_REQUIRED_FIELD);
    });

    it('should throw error for too long secretId', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'a'.repeat(101), envVar: 'TEST_API_KEY' }
      ];
      
      expect(() => new EnvSecretProvider(mappings))
        .toThrow(TEXT.VALIDATION_INVALID_FORMAT);
    });
  });

  describe('getSecretValue', () => {
    it('should return secret value from environment', () => {
      process.env['TEST_API_KEY'] = 'secret-value-123';
      
      const mappings: SecretMapping[] = [
        { secretId: 'test_key', envVar: 'TEST_API_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const value = provider.getSecretValue('test_key');
      
      expect(value).toBe('secret-value-123');
    });

    it('should return undefined for unmapped secret', () => {
      const mappings: SecretMapping[] = [];
      
      const provider = new EnvSecretProvider(mappings);
      const value = provider.getSecretValue('unknown_key');
      
      expect(value).toBeUndefined();
    });

    it('should return undefined for unset environment variable', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test_key', envVar: 'UNSET_VAR' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const value = provider.getSecretValue('test_key');
      
      expect(value).toBeUndefined();
    });

    it('should never log or expose secret values', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const errorSpy = vi.spyOn(console, 'error');
      
      process.env['SENSITIVE_KEY'] = 'super-secret-value';
      
      const mappings: SecretMapping[] = [
        { secretId: 'sensitive', envVar: 'SENSITIVE_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      provider.getSecretValue('sensitive');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('isSecretAvailable', () => {
    it('should return true for available secret', () => {
      process.env['TEST_API_KEY'] = 'secret-value';
      
      const mappings: SecretMapping[] = [
        { secretId: 'test_key', envVar: 'TEST_API_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider.isSecretAvailable('test_key')).toBe(true);
    });

    it('should return false for unmapped secret', () => {
      const mappings: SecretMapping[] = [];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider.isSecretAvailable('unknown_key')).toBe(false);
    });

    it('should return false for unset environment variable', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test_key', envVar: 'UNSET_VAR' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider.isSecretAvailable('test_key')).toBe(false);
    });

    it('should return false for empty environment variable', () => {
      process.env['EMPTY_VAR'] = '';
      
      const mappings: SecretMapping[] = [
        { secretId: 'test_key', envVar: 'EMPTY_VAR' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider.isSecretAvailable('test_key')).toBe(false);
    });
  });

  describe('listAvailableSecrets', () => {
    it('should return sorted list of available secrets', () => {
      process.env['API_KEY_1'] = 'value1';
      process.env['API_KEY_2'] = 'value2';
      
      const mappings: SecretMapping[] = [
        { secretId: 'zebra_key', envVar: 'API_KEY_1' },
        { secretId: 'alpha_key', envVar: 'API_KEY_2' },
        { secretId: 'missing_key', envVar: 'UNSET_VAR' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const available = provider.listAvailableSecrets();
      
      expect(available).toEqual(['alpha_key', 'zebra_key']);
    });

    it('should return empty array when no secrets available', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test_key', envVar: 'UNSET_VAR' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const available = provider.listAvailableSecrets();
      
      expect(available).toEqual([]);
    });

    it('should never include secret values in the list', () => {
      process.env['SECRET_VALUE'] = 'this-should-not-appear';
      
      const mappings: SecretMapping[] = [
        { secretId: 'my_secret', envVar: 'SECRET_VALUE' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const available = provider.listAvailableSecrets();
      
      expect(available).toEqual(['my_secret']);
      expect(available.join('')).not.toContain('this-should-not-appear');
    });
  });

  describe('getSecretMapping', () => {
    it('should return mapping for existing secret', () => {
      const mapping: SecretMapping = {
        secretId: 'test_key',
        envVar: 'TEST_API_KEY',
        description: 'Test API key'
      };
      
      const provider = new EnvSecretProvider([mapping]);
      const result = provider.getSecretMapping('test_key');
      
      expect(result).toEqual(mapping);
    });

    it('should return undefined for unknown secret', () => {
      const provider = new EnvSecretProvider([]);
      const result = provider.getSecretMapping('unknown_key');
      
      expect(result).toBeUndefined();
    });
  });

  describe('security invariants', () => {
    it('should never expose ENV variable names', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test_key', envVar: 'SUPER_SECRET_ENV_VAR_NAME' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const available = provider.listAvailableSecrets();
      
      expect(JSON.stringify(available)).not.toContain('SUPER_SECRET_ENV_VAR_NAME');
    });

    it('should handle multiple mappings to same ENV variable', () => {
      process.env['SHARED_KEY'] = 'shared-value';
      
      const mappings: SecretMapping[] = [
        { secretId: 'key1', envVar: 'SHARED_KEY' },
        { secretId: 'key2', envVar: 'SHARED_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      
      expect(provider.getSecretValue('key1')).toBe('shared-value');
      expect(provider.getSecretValue('key2')).toBe('shared-value');
    });

    it('should deny access to unmapped secrets by default', () => {
      process.env['UNMAPPED_SECRET'] = 'should-not-be-accessible';
      
      const mappings: SecretMapping[] = [];
      
      const provider = new EnvSecretProvider(mappings);
      const value = provider.getSecretValue('UNMAPPED_SECRET');
      
      expect(value).toBeUndefined();
    });
  });
});