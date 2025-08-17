import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEvaluatorService } from './policy-evaluator.service.js';
import { PolicyConfig } from '../interfaces/policy.interface.js';
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
      expect(result.reason).toBeUndefined();
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
      expect(result.reason).toBe(TEXT.ERROR_INVALID_SECRET_ID_FORMAT);
    });

    it('should deny request when policy not found', () => {
      const result = evaluator.evaluate('unknown-key', 'http_get', 'api.example.com');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(TEXT.ERROR_POLICY_NOT_FOUND);
    });

    it('should deny request when policy is expired', () => {
      const result = evaluator.evaluate('expired-key', 'http_get', 'api.example.com');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(TEXT.ERROR_POLICY_EXPIRED);
    });

    it('should allow request when policy not expired', () => {
      const result = evaluator.evaluate('future-key', 'http_post', 'api.future.com');
      
      expect(result.allowed).toBe(true);
    });

    it('should deny request with forbidden action', () => {
      const result = evaluator.evaluate('github-token', 'http_post', 'api.github.com');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(TEXT.ERROR_FORBIDDEN_ACTION);
    });

    it('should deny request with forbidden domain', () => {
      const result = evaluator.evaluate('openai-key', 'http_get', 'api.evil.com');
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(TEXT.ERROR_FORBIDDEN_DOMAIN);
    });

    it('should perform exact domain matching (no wildcards)', () => {
      const result1 = evaluator.evaluate('openai-key', 'http_get', 'sub.api.openai.com');
      expect(result1.allowed).toBe(false);
      expect(result1.reason).toBe(TEXT.ERROR_FORBIDDEN_DOMAIN);
      
      const result2 = evaluator.evaluate('openai-key', 'http_get', 'openai.com');
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toBe(TEXT.ERROR_FORBIDDEN_DOMAIN);
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
      expect(result.reason).toBe(TEXT.ERROR_POLICY_NOT_FOUND);
    });

    it('should handle default empty constructor', () => {
      const defaultEvaluator = new PolicyEvaluatorService();
      
      expect(defaultEvaluator.hasPolicy('any')).toBe(false);
    });
  });
});