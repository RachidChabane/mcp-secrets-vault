import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PolicyProviderService } from './policy-provider.service.js';
import { PolicyConfig, PolicyLoader, PolicyValidator } from '../interfaces/policy.interface.js';

describe('PolicyProviderService', () => {
  let provider: PolicyProviderService;
  let mockLoader: PolicyLoader;
  let mockValidator: PolicyValidator;

  const testPolicies: PolicyConfig[] = [
    {
      secretId: 'test-key',
      allowedActions: ['http_get'],
      allowedDomains: ['api.test.com']
    }
  ];

  beforeEach(() => {
    mockLoader = {
      loadPolicies: vi.fn().mockResolvedValue(testPolicies)
    };

    mockValidator = {
      validate: vi.fn(),
      validateAll: vi.fn()
    };

    provider = new PolicyProviderService(undefined, mockLoader, mockValidator);
  });

  describe('loadPolicies', () => {
    it('should load and validate policies', async () => {
      await provider.loadPolicies();

      expect(mockLoader.loadPolicies).toHaveBeenCalled();
      expect(mockValidator.validateAll).toHaveBeenCalledWith(testPolicies);
    });

    it('should propagate loader errors', async () => {
      const error = new Error('Load failed');
      (mockLoader.loadPolicies as any).mockRejectedValue(error);

      await expect(provider.loadPolicies()).rejects.toThrow('Load failed');
    });

    it('should propagate validation errors', async () => {
      const error = new Error('Validation failed');
      (mockValidator.validateAll as any).mockImplementation(() => {
        throw error;
      });

      await expect(provider.loadPolicies()).rejects.toThrow('Validation failed');
    });
  });

  describe('evaluate', () => {
    it('should evaluate after loading policies', async () => {
      await provider.loadPolicies();

      const result = provider.evaluate('test-key', 'http_get', 'api.test.com');
      expect(result.allowed).toBe(true);
    });

    it('should return not allowed when policies not loaded', () => {
      const result = provider.evaluate('test-key', 'http_get', 'api.test.com');
      
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('policies_not_loaded');
      expect(result.message).toBe('Policies not loaded');
    });

    it('should deny unknown secrets after loading', async () => {
      await provider.loadPolicies();

      const result = provider.evaluate('unknown', 'http_get', 'api.test.com');
      expect(result.allowed).toBe(false);
    });

    it('should deny forbidden actions after loading', async () => {
      await provider.loadPolicies();

      const result = provider.evaluate('test-key', 'http_post', 'api.test.com');
      expect(result.allowed).toBe(false);
    });

    it('should deny forbidden domains after loading', async () => {
      await provider.loadPolicies();

      const result = provider.evaluate('test-key', 'http_get', 'evil.com');
      expect(result.allowed).toBe(false);
    });
  });

  describe('getPolicy', () => {
    it('should return policy after loading', async () => {
      await provider.loadPolicies();

      const policy = provider.getPolicy('test-key');
      expect(policy).toBeDefined();
      expect(policy?.secretId).toBe('test-key');
    });

    it('should return undefined when policies not loaded', () => {
      const policy = provider.getPolicy('test-key');
      expect(policy).toBeUndefined();
    });

    it('should return undefined for unknown secret after loading', async () => {
      await provider.loadPolicies();

      const policy = provider.getPolicy('unknown');
      expect(policy).toBeUndefined();
    });
  });

  describe('hasPolicy', () => {
    it('should return true for existing policy after loading', async () => {
      await provider.loadPolicies();

      expect(provider.hasPolicy('test-key')).toBe(true);
    });

    it('should return false when policies not loaded', () => {
      expect(provider.hasPolicy('test-key')).toBe(false);
    });

    it('should return false for unknown secret after loading', async () => {
      await provider.loadPolicies();

      expect(provider.hasPolicy('unknown')).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should use default services when not provided', () => {
      const defaultProvider = new PolicyProviderService('custom/path.json');
      
      expect(defaultProvider).toBeDefined();
    });

    it('should work with all defaults', () => {
      const defaultProvider = new PolicyProviderService();
      
      expect(defaultProvider).toBeDefined();
    });
  });
});