import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigValidatorService } from './config-validator.service.js';
import { ToolError } from '../utils/errors.js';
import { CONFIG } from '../constants/config-constants.js';

describe('ConfigValidatorService', () => {
  let service: ConfigValidatorService;

  beforeEach(() => {
    service = new ConfigValidatorService();
  });

  describe('validate', () => {
    it('should accept valid configuration', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: []
      };

      expect(() => service.validate(config)).not.toThrow();
    });

    it('should reject invalid configuration with clear error', () => {
      const config = {
        version: '2.0.0',
        mappings: [],
        policies: []
      };

      expect(() => service.validate(config)).toThrow(ToolError);
      expect(() => service.validate(config)).toThrow('Configuration validation failed');
    });

    it('should reject wildcard domains with specific message', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test',
          allowedActions: ['http_get'],
          allowedDomains: ['*.example.com']
        }]
      };

      expect(() => service.validate(config)).toThrow('Wildcards not allowed');
    });

    it('should NOT check for environment variables', () => {
      // This test ensures we're NOT checking if env vars exist
      // That functionality belongs in Task-17 (Doctor CLI)
      const config = {
        version: '1.0.0',
        mappings: [{
          secretId: 'test',
          envVar: 'NON_EXISTENT_ENV_VAR_12345' // Should NOT check if this exists
        }],
        policies: []
      };

      // Should validate successfully without checking env var existence
      expect(() => service.validate(config)).not.toThrow();
    });
  });

  describe('validateDomain', () => {
    it('should accept valid exact FQDNs', () => {
      const validDomains = [
        'example.com',
        'api.example.com',
        'www.example.com',
        'sub.domain.example.com',
        'example.co.uk',
        'test-api.example.com',
        'api-v2.example.com'
      ];

      for (const domain of validDomains) {
        expect(() => service.validateDomain(domain)).not.toThrow();
      }
    });

    it('should reject domains with wildcards', () => {
      const wildcardDomains = [
        '*.example.com',
        'api.*.com',
        'example.*',
        '?.example.com',
        'api[0-9].example.com',
        '*',
        '**.example.com'
      ];

      for (const domain of wildcardDomains) {
        expect(() => service.validateDomain(domain)).toThrow('Wildcards not allowed');
      }
    });

    it('should provide clear error message for wildcards', () => {
      try {
        service.validateDomain('*.example.com');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ToolError);
        expect(error.message).toBe("Wildcards not allowed. Use exact FQDNs only (e.g., 'api.example.com')");
        expect(error.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
      }
    });

    it('should reject domains with trailing dots', () => {
      expect(() => service.validateDomain('example.com.')).toThrow(ToolError);
    });

    it('should reject domains with embedded whitespace', () => {
      expect(() => service.validateDomain('example .com')).toThrow(ToolError);
      // Leading/trailing whitespace gets trimmed automatically
      expect(() => service.validateDomain(' example.com')).not.toThrow();
      expect(() => service.validateDomain('example.com ')).not.toThrow();
    });

    it('should reject domains that are too short', () => {
      expect(() => service.validateDomain('a')).toThrow(ToolError);
      expect(() => service.validateDomain('ab')).toThrow(ToolError);
    });

    it('should reject domains that are too long', () => {
      const longDomain = 'a'.repeat(254) + '.com';
      expect(() => service.validateDomain(longDomain)).toThrow(ToolError);
    });

    it('should reject invalid domain formats', () => {
      const invalidDomains = [
        'not-a-domain',
        'http://example.com',
        'https://example.com',
        'example.com:8080',
        'user@example.com',
        'example..com',
        '.example.com',
        'example.com/',
        'example.com/path',
        '192.168.1.1',
        '[::1]'
      ];

      for (const domain of invalidDomains) {
        expect(() => service.validateDomain(domain)).toThrow(ToolError);
      }
    });
  });

  describe('validateSecretId', () => {
    it('should accept valid secret IDs', () => {
      const validIds = [
        'test-secret',
        'test_secret',
        'TEST_SECRET',
        'api-key-123',
        'SECRET_KEY_1',
        'a',
        'a'.repeat(100) // Max length
      ];

      for (const id of validIds) {
        expect(() => service.validateSecretId(id)).not.toThrow();
      }
    });

    it('should reject invalid secret IDs', () => {
      const invalidIds = [
        '',
        ' ',
        'test secret', // Space not allowed
        'test.secret', // Dot not allowed
        'test@secret', // Special char not allowed
        'a'.repeat(101) // Too long
      ];

      for (const id of invalidIds) {
        expect(() => service.validateSecretId(id)).toThrow(ToolError);
      }
    });
  });

  describe('checkDuplicateSecretIds', () => {
    it('should accept unique secret IDs', () => {
      const mappings = [
        { secretId: 'secret1' },
        { secretId: 'secret2' }
      ];
      const policies = [
        { secretId: 'secret1' },
        { secretId: 'secret2' }
      ];

      expect(() => service.checkDuplicateSecretIds(mappings, policies)).not.toThrow();
    });

    it('should detect duplicate secret IDs in mappings', () => {
      const mappings = [
        { secretId: 'secret1' },
        { secretId: 'secret1' } // Duplicate
      ];
      const policies: any[] = [];

      expect(() => service.checkDuplicateSecretIds(mappings, policies))
        .toThrow('Duplicate secret ID found: secret1');
    });

    it('should detect duplicate policies for same secret', () => {
      const mappings: any[] = [];
      const policies = [
        { secretId: 'secret1' },
        { secretId: 'secret1' } // Duplicate policy
      ];

      expect(() => service.checkDuplicateSecretIds(mappings, policies))
        .toThrow('Duplicate policy for secret ID: secret1');
    });

    it('should handle trimmed secret IDs', () => {
      const mappings = [
        { secretId: '  secret1  ' },
        { secretId: 'secret1' } // Same after trimming
      ];
      const policies: any[] = [];

      expect(() => service.checkDuplicateSecretIds(mappings, policies))
        .toThrow('Duplicate secret ID found: secret1');
    });
  });

  describe('error message formatting', () => {
    it('should provide helpful context for domain errors', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test',
          allowedActions: ['http_get'],
          allowedDomains: ['*.example.com', 'api?.com']
        }]
      };

      try {
        service.validate(config);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Wildcards not allowed');
        expect(error.message).toContain('All domains must be exact FQDNs');
      }
    });

    it('should provide clear error for unsupported actions', () => {
      const config = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test',
          allowedActions: ['http_delete'], // Not supported
          allowedDomains: ['example.com']
        }]
      };

      try {
        service.validate(config);
        expect.fail('Should have thrown');
      } catch (error: any) {
        // Check for our formatted error message that includes supported actions
        expect(error.message).toContain('http_get, http_post');
      }
    });

    it('should provide clear error for wrong version', () => {
      const config = {
        version: '2.0.0',
        mappings: [],
        policies: []
      };

      try {
        service.validate(config);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain("Must be 1.0.0 (current schema version)");
      }
    });
  });

  describe('security invariants', () => {
    it('should NEVER expose environment variable values', () => {
      // This test verifies the validator never tries to read env var values
      const config = {
        version: '1.0.0',
        mappings: [{
          secretId: 'test',
          envVar: 'SOME_SECRET_KEY'
        }],
        policies: []
      };

      // Should validate without accessing process.env
      const originalEnv = process.env;
      process.env = new Proxy({}, {
        get: () => {
          throw new Error('Validator should not access environment variables!');
        }
      });

      try {
        expect(() => service.validate(config)).not.toThrow();
      } finally {
        process.env = originalEnv;
      }
    });

    it('should enforce exact FQDN matching at schema level', () => {
      // This verifies wildcard rejection happens in the schema, not implicitly
      const wildcardConfigs = [
        { allowedDomains: ['*.example.com'] },
        { allowedDomains: ['api.*.com'] },
        { allowedDomains: ['example.*'] },
        { allowedDomains: ['?pi.example.com'] },
        { allowedDomains: ['api[0-9].example.com'] }
      ];

      for (const domains of wildcardConfigs) {
        const config = {
          version: '1.0.0',
          mappings: [],
          policies: [{
            secretId: 'test',
            allowedActions: ['http_get'],
            ...domains
          }]
        };

        expect(() => service.validate(config)).toThrow('Wildcards not allowed');
      }
    });
  });
});