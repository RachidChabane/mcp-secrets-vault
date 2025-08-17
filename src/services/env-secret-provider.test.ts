import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnvSecretProvider } from './env-secret-provider.js';
import { SecretMapping } from '../interfaces/secret-mapping.interface.js';
import { CONFIG } from '../constants/config-constants.js';
import { ConfigurationError, ValidationError } from '../utils/errors.js';

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
        { secretId: 'test-key', envVar: 'TEST_API_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider).toBeDefined();
    });

    it('should normalize and trim inputs', () => {
      const mappings: SecretMapping[] = [
        { secretId: '  test-key  ', envVar: '  TEST_API_KEY  ', description: '  Test key  ' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const info = provider.getSecretInfo('test-key');
      
      expect(info?.secretId).toBe('test-key');
      expect(info?.description).toBe('Test key');
    });

    it('should throw error for invalid secretId format', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test key!', envVar: 'TEST_API_KEY' }
      ];
      
      expect(() => new EnvSecretProvider(mappings))
        .toThrow(ValidationError);
    });

    it('should throw error for secretId too short', () => {
      const mappings: SecretMapping[] = [
        { secretId: '', envVar: 'TEST_API_KEY' }
      ];
      
      expect(() => new EnvSecretProvider(mappings))
        .toThrow(ValidationError);
    });

    it('should throw error for secretId too long', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'a'.repeat(CONFIG.MAX_SECRET_ID_LENGTH + 1), envVar: 'TEST_API_KEY' }
      ];
      
      expect(() => new EnvSecretProvider(mappings))
        .toThrow(ValidationError);
    });

    it('should throw error for invalid envVar format', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: '123_INVALID' }
      ];
      
      expect(() => new EnvSecretProvider(mappings))
        .toThrow(ValidationError);
    });

    it('should throw error for duplicate secretId', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'TEST_API_KEY1' },
        { secretId: 'test-key', envVar: 'TEST_API_KEY2' }
      ];
      
      expect(() => new EnvSecretProvider(mappings))
        .toThrow(ConfigurationError);
    });

    it('should allow multiple mappings to same ENV variable', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'key1', envVar: 'SHARED_KEY' },
        { secretId: 'key2', envVar: 'SHARED_KEY' }
      ];
      
      expect(() => new EnvSecretProvider(mappings)).not.toThrow();
    });
  });

  describe('listSecretIds', () => {
    it('should return sorted list of secret IDs', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'zebra-key', envVar: 'API_KEY_1' },
        { secretId: 'alpha-key', envVar: 'API_KEY_2' },
        { secretId: 'beta-key', envVar: 'API_KEY_3' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const ids = provider.listSecretIds();
      
      expect(ids).toEqual(['alpha-key', 'beta-key', 'zebra-key']);
    });

    it('should return empty array when no mappings', () => {
      const provider = new EnvSecretProvider([]);
      const ids = provider.listSecretIds();
      
      expect(ids).toEqual([]);
    });

    it('should return immutable array', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'TEST_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const ids = provider.listSecretIds();
      
      expect(() => {
        (ids as any).push('new-key');
      }).toThrow();
    });

    it('should never expose ENV variable names', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'SUPER_SECRET_ENV_VAR' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const ids = provider.listSecretIds();
      
      expect(JSON.stringify(ids)).not.toContain('SUPER_SECRET_ENV_VAR');
    });
  });

  describe('isSecretAvailable', () => {
    it('should return true for available secret', () => {
      process.env['TEST_API_KEY'] = 'secret-value';
      
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'TEST_API_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider.isSecretAvailable('test-key')).toBe(true);
    });

    it('should handle trimmed input', () => {
      process.env['TEST_API_KEY'] = 'secret-value';
      
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'TEST_API_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider.isSecretAvailable('  test-key  ')).toBe(true);
    });

    it('should return false for unmapped secret', () => {
      const provider = new EnvSecretProvider([]);
      expect(provider.isSecretAvailable('unknown-key')).toBe(false);
    });

    it('should return false for unset environment variable', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'UNSET_VAR' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider.isSecretAvailable('test-key')).toBe(false);
    });

    it('should return false for empty environment variable', () => {
      process.env['EMPTY_VAR'] = '';
      
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'EMPTY_VAR' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider.isSecretAvailable('test-key')).toBe(false);
    });

    it('should return false for whitespace-only environment variable', () => {
      process.env['WHITESPACE_VAR'] = '   ';
      
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'WHITESPACE_VAR' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      expect(provider.isSecretAvailable('test-key')).toBe(false);
    });
  });

  describe('getSecretInfo', () => {
    it('should return info for existing secret', () => {
      process.env['TEST_KEY'] = 'value';
      
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'TEST_KEY', description: 'Test API key' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const info = provider.getSecretInfo('test-key');
      
      expect(info).toEqual({
        secretId: 'test-key',
        available: true,
        description: 'Test API key'
      });
    });

    it('should never expose ENV variable name', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'SUPER_SECRET_ENV' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const info = provider.getSecretInfo('test-key');
      
      expect(JSON.stringify(info)).not.toContain('SUPER_SECRET_ENV');
    });

    it('should return undefined for unknown secret', () => {
      const provider = new EnvSecretProvider([]);
      const info = provider.getSecretInfo('unknown-key');
      
      expect(info).toBeUndefined();
    });

    it('should return immutable info', () => {
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'TEST_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const info = provider.getSecretInfo('test-key');
      
      if (info) {
        expect(() => {
          (info as any).secretId = 'modified';
        }).toThrow();
      }
    });
  });

  describe('getSecretValue', () => {
    it('should return secret value from environment', () => {
      process.env['TEST_API_KEY'] = 'secret-value-123';
      
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'TEST_API_KEY' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const value = (provider as any).getSecretValue('test-key');
      
      expect(value).toBe('secret-value-123');
    });

    it('should return undefined for unmapped secret', () => {
      const provider = new EnvSecretProvider([]);
      const value = (provider as any).getSecretValue('unknown-key');
      
      expect(value).toBeUndefined();
    });

    it('should return undefined for empty environment variable', () => {
      process.env['EMPTY_VAR'] = '   ';
      
      const mappings: SecretMapping[] = [
        { secretId: 'test-key', envVar: 'EMPTY_VAR' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      const value = (provider as any).getSecretValue('test-key');
      
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
      (provider as any).getSecretValue('sensitive');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('security invariants', () => {
    it('should deny access to unmapped secrets by default', () => {
      process.env['UNMAPPED_SECRET'] = 'should-not-be-accessible';
      
      const provider = new EnvSecretProvider([]);
      const value = (provider as any).getSecretValue('UNMAPPED_SECRET');
      
      expect(value).toBeUndefined();
    });

    it('should never expose secret values in any public method', () => {
      process.env['SECRET_VALUE'] = 'this-should-not-appear';
      
      const mappings: SecretMapping[] = [
        { secretId: 'my-secret', envVar: 'SECRET_VALUE' }
      ];
      
      const provider = new EnvSecretProvider(mappings);
      
      const ids = provider.listSecretIds();
      const info = provider.getSecretInfo('my-secret');
      const available = provider.isSecretAvailable('my-secret');
      
      const allPublicOutput = JSON.stringify({ ids, info, available });
      expect(allPublicOutput).not.toContain('this-should-not-appear');
      expect(allPublicOutput).not.toContain('SECRET_VALUE');
    });

    it('should validate ENV variable format strictly', () => {
      const invalidEnvVars = [
        'lowercase',
        '123START',
        'HAS-DASH',
        'HAS SPACE',
        'HAS.DOT',
        ''
      ];
      
      for (const envVar of invalidEnvVars) {
        const mappings: SecretMapping[] = [
          { secretId: 'test', envVar }
        ];
        
        expect(() => new EnvSecretProvider(mappings))
          .toThrow(ValidationError);
      }
    });

    it('should validate secret ID format strictly', () => {
      const invalidSecretIds = [
        'has space',
        'has!special',
        'has@symbol',
        'has#hash',
        'has$dollar',
        'has%percent',
        ''
      ];
      
      for (const secretId of invalidSecretIds) {
        const mappings: SecretMapping[] = [
          { secretId, envVar: 'VALID_ENV' }
        ];
        
        expect(() => new EnvSecretProvider(mappings))
          .toThrow(ValidationError);
      }
    });
  });
});