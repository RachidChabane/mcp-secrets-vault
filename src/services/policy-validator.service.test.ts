import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyValidatorService } from './policy-validator.service.js';
import { PolicyConfig } from '../interfaces/policy.interface.js';
import { TEXT } from '../constants/text-constants.js';

describe('PolicyValidatorService', () => {
  let validator: PolicyValidatorService;

  beforeEach(() => {
    validator = new PolicyValidatorService();
  });

  describe('validate', () => {
    it('should validate a valid policy', () => {
      const validPolicy: PolicyConfig = {
        secretId: 'test-secret',
        allowedActions: ['http_get', 'http_post'],
        allowedDomains: ['api.example.com', 'test.example.com']
      };

      expect(() => validator.validate(validPolicy)).not.toThrow();
    });

    it('should validate a policy with rate limit', () => {
      const policy: PolicyConfig = {
        secretId: 'test-secret',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com'],
        rateLimit: { requests: 100, windowSeconds: 3600 }
      };

      expect(() => validator.validate(policy)).not.toThrow();
    });

    it('should validate a policy with expiration', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const policy: PolicyConfig = {
        secretId: 'test-secret',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com'],
        expiresAt: futureDate
      };

      expect(() => validator.validate(policy)).not.toThrow();
    });

    it('should reject invalid policy structure', () => {
      expect(() => validator.validate(null as any)).toThrow(TEXT.ERROR_INVALID_POLICY_STRUCTURE);
      expect(() => validator.validate(undefined as any)).toThrow(TEXT.ERROR_INVALID_POLICY_STRUCTURE);
      expect(() => validator.validate('string' as any)).toThrow(TEXT.ERROR_INVALID_POLICY_STRUCTURE);
    });

    it('should reject policy with missing required fields', () => {
      const missingSecretId = {
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com']
      } as any;

      expect(() => validator.validate(missingSecretId)).toThrow(TEXT.ERROR_MISSING_POLICY_FIELD);

      const missingActions = {
        secretId: 'test',
        allowedDomains: ['api.example.com']
      } as any;

      expect(() => validator.validate(missingActions)).toThrow(TEXT.ERROR_MISSING_POLICY_FIELD);

      const missingDomains = {
        secretId: 'test',
        allowedActions: ['http_get']
      } as any;

      expect(() => validator.validate(missingDomains)).toThrow(TEXT.ERROR_MISSING_POLICY_FIELD);
    });

    it('should reject invalid secret ID', () => {
      const emptySecretId: PolicyConfig = {
        secretId: '',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com']
      };

      expect(() => validator.validate(emptySecretId)).toThrow(TEXT.ERROR_SECRET_ID_TOO_SHORT);

      const invalidChars: PolicyConfig = {
        secretId: 'test secret!',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com']
      };

      expect(() => validator.validate(invalidChars)).toThrow(TEXT.ERROR_INVALID_SECRET_ID_FORMAT);

      const tooLong: PolicyConfig = {
        secretId: 'a'.repeat(101),
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com']
      };

      expect(() => validator.validate(tooLong)).toThrow(TEXT.ERROR_SECRET_ID_TOO_LONG);
    });

    it('should reject invalid allowed actions', () => {
      const notArray: PolicyConfig = {
        secretId: 'test',
        allowedActions: 'http_get' as any,
        allowedDomains: ['api.example.com']
      };

      expect(() => validator.validate(notArray)).toThrow(TEXT.ERROR_INVALID_ALLOWED_ACTIONS);

      const emptyArray: PolicyConfig = {
        secretId: 'test',
        allowedActions: [],
        allowedDomains: ['api.example.com']
      };

      expect(() => validator.validate(emptyArray)).toThrow(TEXT.ERROR_EMPTY_ALLOWED_ACTIONS);

      const unsupported: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_delete'],
        allowedDomains: ['api.example.com']
      };

      expect(() => validator.validate(unsupported)).toThrow(TEXT.ERROR_UNSUPPORTED_ACTION);

      const invalidFormat: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['HTTP-GET'],
        allowedDomains: ['api.example.com']
      };

      expect(() => validator.validate(invalidFormat)).toThrow(TEXT.ERROR_INVALID_ACTION);
    });

    it('should reject invalid allowed domains', () => {
      const notArray: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: 'api.example.com' as any
      };

      expect(() => validator.validate(notArray)).toThrow(TEXT.ERROR_INVALID_ALLOWED_DOMAINS);

      const emptyArray: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: []
      };

      expect(() => validator.validate(emptyArray)).toThrow(TEXT.ERROR_EMPTY_ALLOWED_DOMAINS);

      const invalidDomain: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: ['not a domain']
      };

      expect(() => validator.validate(invalidDomain)).toThrow(TEXT.ERROR_INVALID_DOMAIN);

      const wildcard: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: ['*.example.com']
      };

      expect(() => validator.validate(wildcard)).toThrow(TEXT.ERROR_INVALID_DOMAIN);

      const trailingDot: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com.']
      };

      expect(() => validator.validate(trailingDot)).toThrow(TEXT.ERROR_INVALID_DOMAIN);

      const embeddedSpace: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: ['api .example.com']
      };

      expect(() => validator.validate(embeddedSpace)).toThrow(TEXT.ERROR_INVALID_DOMAIN);

      const leadingSpace: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: [' api.example.com']
      };

      // Leading/trailing spaces are trimmed, so this should pass after trimming
      expect(() => validator.validate(leadingSpace)).not.toThrow();

      const trailingSpace: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com ']
      };

      // Leading/trailing spaces are trimmed, so this should pass after trimming
      expect(() => validator.validate(trailingSpace)).not.toThrow();
    });

    it('should reject invalid rate limit', () => {
      const invalidRequests: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com'],
        rateLimit: { requests: -1, windowSeconds: 3600 }
      };

      expect(() => validator.validate(invalidRequests)).toThrow(TEXT.ERROR_INVALID_RATE_LIMIT);

      const invalidWindow: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com'],
        rateLimit: { requests: 100, windowSeconds: 0 }
      };

      expect(() => validator.validate(invalidWindow)).toThrow(TEXT.ERROR_INVALID_RATE_LIMIT);
    });

    it('should reject invalid expiration', () => {
      const invalidDate: PolicyConfig = {
        secretId: 'test',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com'],
        expiresAt: 'not a date'
      };

      expect(() => validator.validate(invalidDate)).toThrow(TEXT.ERROR_INVALID_EXPIRATION);
    });

    it('should trim whitespace from inputs', () => {
      const policy: PolicyConfig = {
        secretId: '  test-secret  ',
        allowedActions: ['  http_get  ', 'http_post'],
        allowedDomains: ['  api.example.com  ']
      };

      expect(() => validator.validate(policy)).not.toThrow();
    });
  });

  describe('validateAll', () => {
    it('should validate multiple policies', () => {
      const policies: PolicyConfig[] = [
        {
          secretId: 'secret1',
          allowedActions: ['http_get'],
          allowedDomains: ['api1.example.com']
        },
        {
          secretId: 'secret2',
          allowedActions: ['http_post'],
          allowedDomains: ['api2.example.com']
        }
      ];

      expect(() => validator.validateAll(policies)).not.toThrow();
    });

    it('should reject duplicate secret IDs', () => {
      const policies: PolicyConfig[] = [
        {
          secretId: 'duplicate',
          allowedActions: ['http_get'],
          allowedDomains: ['api1.example.com']
        },
        {
          secretId: 'duplicate',
          allowedActions: ['http_post'],
          allowedDomains: ['api2.example.com']
        }
      ];

      expect(() => validator.validateAll(policies)).toThrow(TEXT.ERROR_DUPLICATE_POLICY);
    });

    it('should clear seen IDs between validateAll calls', () => {
      const policies1: PolicyConfig[] = [
        {
          secretId: 'test',
          allowedActions: ['http_get'],
          allowedDomains: ['api.example.com']
        }
      ];

      const policies2: PolicyConfig[] = [
        {
          secretId: 'test',
          allowedActions: ['http_post'],
          allowedDomains: ['api.example.com']
        }
      ];

      expect(() => validator.validateAll(policies1)).not.toThrow();
      expect(() => validator.validateAll(policies2)).not.toThrow();
    });
  });
});