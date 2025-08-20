import { describe, it, expect } from 'vitest';
import { VaultConfigSchema, containsWildcards, validateVaultConfig } from './config.schema.js';

describe('VaultConfigSchema', () => {
  describe('version field', () => {
    it('should accept version 1.0.0', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: []
      };
      expect(() => VaultConfigSchema.parse(config)).not.toThrow();
    });

    it('should reject other versions', () => {
      const config = {
        version: '2.0.0',
        mappings: [],
        policies: []
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow();
    });
  });

  describe('domain validation - exact FQDN enforcement', () => {
    it('should accept exact FQDNs', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: ['api.example.com', 'www.example.com', 'app.example.com']
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).not.toThrow();
    });

    it('should reject wildcard with asterisk', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: ['*.example.com']
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow('Wildcards not allowed');
    });

    it('should reject wildcard with question mark', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: ['api?.example.com']
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow('Wildcards not allowed');
    });

    it('should reject wildcard with brackets', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: ['api[0-9].example.com']
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow('Wildcards not allowed');
    });

    it('should reject trailing dot in domain', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: ['example.com.']
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow();
    });

    it('should reject domain with whitespace', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: ['example .com']
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow();
    });

    it('should normalize domains to lowercase', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: ['API.EXAMPLE.COM']
        }]
      };
      const parsed = VaultConfigSchema.parse(config);
      expect(parsed.policies[0]?.allowedDomains[0]).toBe('api.example.com');
    });
  });

  describe('mappings validation', () => {
    it('should accept valid mappings', () => {
      const config = {
        version: '1.0.0',
        mappings: [{
          secretId: 'test-secret',
          envVar: 'TEST_SECRET',
          description: 'Test secret'
        }],
        policies: []
      };
      expect(() => VaultConfigSchema.parse(config)).not.toThrow();
    });

    it('should reject invalid secret ID format', () => {
      const config = {
        version: '1.0.0',
        mappings: [{
          secretId: 'test secret', // space not allowed
          envVar: 'TEST_SECRET'
        }],
        policies: []
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow();
    });

    it('should reject lowercase env var', () => {
      const config = {
        version: '1.0.0',
        mappings: [{
          secretId: 'test-secret',
          envVar: 'test_secret' // must be uppercase
        }],
        policies: []
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow();
    });

    it('should accept env var with underscores', () => {
      const config = {
        version: '1.0.0',
        mappings: [{
          secretId: 'test-secret',
          envVar: 'TEST_SECRET_KEY_123'
        }],
        policies: []
      };
      expect(() => VaultConfigSchema.parse(config)).not.toThrow();
    });
  });

  describe('policies validation', () => {
    it('should accept valid policies', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get', 'http_post'],
          allowedDomains: ['api.example.com'],
          rateLimit: {
            requests: 100,
            windowSeconds: 3600
          },
          expiresAt: '2025-12-31T23:59:59Z'
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).not.toThrow();
    });

    it('should reject empty allowedActions', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: [],
          allowedDomains: ['api.example.com']
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow();
    });

    it('should reject empty allowedDomains', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: []
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow();
    });

    it('should reject invalid action', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_delete'], // not supported
          allowedDomains: ['api.example.com']
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).toThrow();
    });

    it('should accept only supported actions', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get', 'http_post'],
          allowedDomains: ['api.example.com']
        }]
      };
      expect(() => VaultConfigSchema.parse(config)).not.toThrow();
    });
  });

  describe('settings validation', () => {
    it('should accept valid settings', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [],
        settings: {
          auditDir: 'audit',
          maxFileSizeMb: 100,
          maxFileAgeDays: 30,
          defaultRateLimit: {
            requests: 100,
            windowSeconds: 3600
          }
        }
      };
      expect(() => VaultConfigSchema.parse(config)).not.toThrow();
    });

    it('should accept partial settings', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [],
        settings: {
          auditDir: 'audit'
        }
      };
      expect(() => VaultConfigSchema.parse(config)).not.toThrow();
    });

    it('should accept missing settings', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: []
      };
      expect(() => VaultConfigSchema.parse(config)).not.toThrow();
    });
  });

  describe('containsWildcards helper', () => {
    it('should detect asterisk wildcard', () => {
      expect(containsWildcards('*.example.com')).toBe(true);
      expect(containsWildcards('api.*.com')).toBe(true);
      expect(containsWildcards('example.*')).toBe(true);
    });

    it('should detect question mark wildcard', () => {
      expect(containsWildcards('api?.example.com')).toBe(true);
      expect(containsWildcards('?pi.example.com')).toBe(true);
    });

    it('should detect bracket wildcard', () => {
      expect(containsWildcards('api[0-9].example.com')).toBe(true);
      expect(containsWildcards('api[abc].example.com')).toBe(true);
    });

    it('should return false for exact domains', () => {
      expect(containsWildcards('api.example.com')).toBe(false);
      expect(containsWildcards('www.example.com')).toBe(false);
      expect(containsWildcards('example.com')).toBe(false);
    });
  });

  describe('validateVaultConfig', () => {
    it('should provide clear error messages for wildcard domains', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test',
          allowedActions: ['http_get'],
          allowedDomains: ['*.example.com']
        }]
      };
      
      expect(() => validateVaultConfig(config)).toThrow('Wildcards not allowed');
    });

    it('should provide clear error for invalid version', () => {
      const config = {
        version: '2.0.0',
        mappings: [],
        policies: []
      };
      
      expect(() => validateVaultConfig(config)).toThrow('Configuration validation failed');
    });
  });

  describe('deny-by-default behavior', () => {
    it('should allow empty mappings and policies (deny all)', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: []
      };
      expect(() => VaultConfigSchema.parse(config)).not.toThrow();
    });

    it('should default to empty arrays if not provided', () => {
      const config = {
        version: '1.0.0'
      };
      const parsed = VaultConfigSchema.parse(config);
      expect(parsed.mappings).toEqual([]);
      expect(parsed.policies).toEqual([]);
    });
  });
});