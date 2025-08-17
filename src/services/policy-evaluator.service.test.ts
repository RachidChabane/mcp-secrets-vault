import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEvaluatorService } from './policy-evaluator.service.js';
import { PolicyConfig } from '../interfaces/policy.interface.js';
import { CONFIG } from '../constants/config-constants.js';
import { TEXT } from '../constants/text-constants.js';

describe('PolicyEvaluatorService', () => {
  let evaluator: PolicyEvaluatorService;
  const testPolicies: PolicyConfig[] = [
    {
      secretId: 'openai-key',
      allowedActions: ['http_get', 'http_post'],
      allowedDomains: ['api.openai.com', 'test.openai.com']
    },
    {
      secretId: 'github-token',
      allowedActions: ['http_get'],
      allowedDomains: ['api.github.com'],
      rateLimit: { requests: 100, windowSeconds: 3600 }
    },
    {
      secretId: 'expired-key',
      allowedActions: ['http_get'],
      allowedDomains: ['api.example.com'],
      expiresAt: '2020-01-01T00:00:00Z'
    },
    {
      secretId: 'future-key',
      allowedActions: ['http_post'],
      allowedDomains: ['api.future.com'],
      expiresAt: '2099-12-31T23:59:59Z'
    }
  ];

  beforeEach(() => {
    evaluator = new PolicyEvaluatorService(testPolicies);
  });

  describe('evaluate', () => {
    it('should allow valid request', () => {
      const result = evaluator.evaluate('openai-key', 'http_get', 'api.openai.com');
      
      expect(result.allowed).toBe(true);
      expect(result.code).toBeUndefined();
      expect(result.message).toBeUndefined();
    });

    it('should allow request with different case domain', () => {
      const result = evaluator.evaluate('openai-key', 'http_get', 'API.OPENAI.COM');
      
      expect(result.allowed).toBe(true);
    });

    it('should trim whitespace from inputs', () => {
      const result = evaluator.evaluate('  openai-key  ', '  http_get  ', '  api.openai.com  ');
      
      expect(result.allowed).toBe(true);
    });

    it('should deny request with invalid secret ID format', () => {
      const result = evaluator.evaluate('', 'http_get', 'api.openai.com');
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
      expect(result.message).toBe(TEXT.ERROR_INVALID_REQUEST);
    });

    it('should deny request when policy not found', () => {
      const result = evaluator.evaluate('unknown-key', 'http_get', 'api.example.com');
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(CONFIG.ERROR_CODE_NO_POLICY);
      expect(result.message).toBe(TEXT.ERROR_POLICY_NOT_FOUND);
    });

    it('should deny request when policy is expired', () => {
      const result = evaluator.evaluate('expired-key', 'http_get', 'api.example.com');
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(CONFIG.ERROR_CODE_POLICY_EXPIRED);
      expect(result.message).toBe(TEXT.ERROR_POLICY_EXPIRED);
    });

    it('should allow request when policy not expired', () => {
      const result = evaluator.evaluate('future-key', 'http_post', 'api.future.com');
      
      expect(result.allowed).toBe(true);
    });

    it('should deny request with forbidden action', () => {
      const result = evaluator.evaluate('github-token', 'http_post', 'api.github.com');
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(CONFIG.ERROR_CODE_FORBIDDEN_ACTION);
      expect(result.message).toBe(TEXT.ERROR_FORBIDDEN_ACTION);
    });

    it('should deny request with forbidden domain', () => {
      const result = evaluator.evaluate('openai-key', 'http_get', 'api.evil.com');
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(CONFIG.ERROR_CODE_FORBIDDEN_DOMAIN);
      expect(result.message).toBe(TEXT.ERROR_FORBIDDEN_DOMAIN);
    });

    it('should perform exact domain matching (no wildcards)', () => {
      const result1 = evaluator.evaluate('openai-key', 'http_get', 'sub.api.openai.com');
      expect(result1.allowed).toBe(false);
      expect(result1.code).toBe(CONFIG.ERROR_CODE_FORBIDDEN_DOMAIN);
      expect(result1.message).toBe(TEXT.ERROR_FORBIDDEN_DOMAIN);
      
      const result2 = evaluator.evaluate('openai-key', 'http_get', 'openai.com');
      expect(result2.allowed).toBe(false);
      expect(result2.code).toBe(CONFIG.ERROR_CODE_FORBIDDEN_DOMAIN);
      expect(result2.message).toBe(TEXT.ERROR_FORBIDDEN_DOMAIN);
    });

    it('should handle multiple allowed domains', () => {
      const result1 = evaluator.evaluate('openai-key', 'http_get', 'api.openai.com');
      expect(result1.allowed).toBe(true);
      
      const result2 = evaluator.evaluate('openai-key', 'http_get', 'test.openai.com');
      expect(result2.allowed).toBe(true);
    });

    it('should handle multiple allowed actions', () => {
      const result1 = evaluator.evaluate('openai-key', 'http_get', 'api.openai.com');
      expect(result1.allowed).toBe(true);
      
      const result2 = evaluator.evaluate('openai-key', 'http_post', 'api.openai.com');
      expect(result2.allowed).toBe(true);
    });

    it('should normalize action to lowercase', () => {
      const result1 = evaluator.evaluate('openai-key', 'HTTP_GET', 'api.openai.com');
      expect(result1.allowed).toBe(true);
      
      const result2 = evaluator.evaluate('openai-key', 'Http_Post', 'api.openai.com');
      expect(result2.allowed).toBe(true);
    });

    it('should deny unsupported actions', () => {
      const result = evaluator.evaluate('openai-key', 'http_delete', 'api.openai.com');
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(CONFIG.ERROR_CODE_FORBIDDEN_ACTION);
      expect(result.message).toBe(TEXT.ERROR_UNSUPPORTED_ACTION);
    });

    it('should treat expiresAt === now as expired', () => {
      const now = new Date();
      const nowPolicy: PolicyConfig = {
        secretId: 'now-key',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com'],
        expiresAt: now.toISOString()
      };
      
      const nowEvaluator = new PolicyEvaluatorService([nowPolicy]);
      const result = nowEvaluator.evaluate('now-key', 'http_get', 'api.example.com');
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(CONFIG.ERROR_CODE_POLICY_EXPIRED);
      expect(result.message).toBe(TEXT.ERROR_POLICY_EXPIRED);
    });

    it('should return invalid request for missing inputs', () => {
      const result1 = evaluator.evaluate('', '', '');
      expect(result1.allowed).toBe(false);
      expect(result1.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
      
      const result2 = evaluator.evaluate('openai-key', '', 'api.openai.com');
      expect(result2.allowed).toBe(false);
      expect(result2.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
      
      const result3 = evaluator.evaluate('openai-key', 'http_get', '');
      expect(result3.allowed).toBe(false);
      expect(result3.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
    });
  });

  describe('getPolicy', () => {
    it('should return policy for existing secret', () => {
      const policy = evaluator.getPolicy('openai-key');
      
      expect(policy).toBeDefined();
      expect(policy?.secretId).toBe('openai-key');
      expect(policy?.allowedActions).toEqual(['http_get', 'http_post']);
    });

    it('should return undefined for non-existent secret', () => {
      const policy = evaluator.getPolicy('unknown');
      
      expect(policy).toBeUndefined();
    });

    it('should trim secret ID', () => {
      const policy = evaluator.getPolicy('  openai-key  ');
      
      expect(policy).toBeDefined();
      expect(policy?.secretId).toBe('openai-key');
    });

    it('should return undefined for empty secret ID', () => {
      const policy = evaluator.getPolicy('');
      
      expect(policy).toBeUndefined();
    });
  });

  describe('hasPolicy', () => {
    it('should return true for existing policy', () => {
      expect(evaluator.hasPolicy('openai-key')).toBe(true);
      expect(evaluator.hasPolicy('github-token')).toBe(true);
    });

    it('should return false for non-existent policy', () => {
      expect(evaluator.hasPolicy('unknown')).toBe(false);
    });

    it('should trim secret ID', () => {
      expect(evaluator.hasPolicy('  openai-key  ')).toBe(true);
    });

    it('should return false for empty secret ID', () => {
      expect(evaluator.hasPolicy('')).toBe(false);
      expect(evaluator.hasPolicy(null as any)).toBe(false);
      expect(evaluator.hasPolicy(undefined as any)).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should handle empty policies array', () => {
      const emptyEvaluator = new PolicyEvaluatorService([]);
      
      expect(emptyEvaluator.hasPolicy('any')).toBe(false);
      
      const result = emptyEvaluator.evaluate('any', 'http_get', 'example.com');
      expect(result.allowed).toBe(false);
      expect(result.code).toBe(CONFIG.ERROR_CODE_NO_POLICY);
      expect(result.message).toBe(TEXT.ERROR_POLICY_NOT_FOUND);
    });

    it('should handle default empty constructor', () => {
      const defaultEvaluator = new PolicyEvaluatorService();
      
      expect(defaultEvaluator.hasPolicy('any')).toBe(false);
    });

    it('should trim secretId keys when storing policies', () => {
      const policiesWithSpaces: PolicyConfig[] = [
        {
          secretId: '  trimmed-key  ',
          allowedActions: ['http_get'],
          allowedDomains: ['api.example.com']
        }
      ];
      
      const evaluatorWithSpaces = new PolicyEvaluatorService(policiesWithSpaces);
      
      // Should find policy when queried with trimmed key
      expect(evaluatorWithSpaces.hasPolicy('trimmed-key')).toBe(true);
      expect(evaluatorWithSpaces.hasPolicy('  trimmed-key  ')).toBe(true);
      
      // Should allow valid request with trimmed key
      const result = evaluatorWithSpaces.evaluate('trimmed-key', 'http_get', 'api.example.com');
      expect(result.allowed).toBe(true);
      
      // Should also work with spaces in query
      const resultWithSpaces = evaluatorWithSpaces.evaluate('  trimmed-key  ', 'http_get', 'api.example.com');
      expect(resultWithSpaces.allowed).toBe(true);
    });
  });
});