import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { PolicyLoaderService } from './policy-loader.service.js';
import { PolicyConfig } from '../interfaces/policy.interface.js';
import { TEXT } from '../constants/text-constants.js';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn()
  }
}));

describe('PolicyLoaderService', () => {
  let loader: PolicyLoaderService;
  const mockReadFile = fs.readFile as any;

  beforeEach(() => {
    loader = new PolicyLoaderService('policies.json');
    vi.clearAllMocks();
  });

  describe('loadPolicies', () => {
    it('should load and parse valid policies', async () => {
      const policies: PolicyConfig[] = [
        {
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: ['api.example.com']
        }
      ];

      mockReadFile.mockResolvedValue(JSON.stringify(policies));

      const result = await loader.loadPolicies();

      expect(result).toHaveLength(1);
      expect(result[0]?.secretId).toBe('test-secret');
      expect(result[0]?.allowedActions).toEqual(['http_get']);
      expect(result[0]?.allowedDomains).toEqual(['api.example.com']);
    });

    it('should return empty array when file does not exist', async () => {
      const error = new Error('File not found') as any;
      error.code = 'ENOENT';
      mockReadFile.mockRejectedValue(error);

      const result = await loader.loadPolicies();

      expect(result).toEqual([]);
    });

    it('should throw error for invalid JSON', async () => {
      mockReadFile.mockResolvedValue('invalid json');

      await expect(loader.loadPolicies()).rejects.toThrow(TEXT.ERROR_INVALID_CONFIG);
    });

    it('should throw error when data is not an array', async () => {
      mockReadFile.mockResolvedValue('{"not": "array"}');

      await expect(loader.loadPolicies()).rejects.toThrow(TEXT.ERROR_INVALID_CONFIG);
    });

    it('should trim whitespace from policy fields', async () => {
      const policies: PolicyConfig[] = [
        {
          secretId: '  test-secret  ',
          allowedActions: ['  http_get  ', 'http_post  '],
          allowedDomains: ['  api.example.com  '],
          expiresAt: '  2024-12-31T23:59:59Z  '
        }
      ];

      mockReadFile.mockResolvedValue(JSON.stringify(policies));

      const result = await loader.loadPolicies();

      expect(result[0]?.secretId).toBe('test-secret');
      expect(result[0]?.allowedActions).toEqual(['http_get', 'http_post']); // normalized to lowercase
      expect(result[0]?.allowedDomains).toEqual(['api.example.com']);
      expect(result[0]?.expiresAt).toBe('2024-12-31T23:59:59Z');
    });

    it('should freeze policy objects', async () => {
      const policies: PolicyConfig[] = [
        {
          secretId: 'test',
          allowedActions: ['http_get'],
          allowedDomains: ['api.example.com'],
          rateLimit: { requests: 100, windowSeconds: 3600 }
        }
      ];

      mockReadFile.mockResolvedValue(JSON.stringify(policies));

      const result = await loader.loadPolicies();

      expect(Object.isFrozen(result[0])).toBe(true);
      expect(Object.isFrozen(result[0]?.rateLimit)).toBe(true);
    });

    it('should handle policies with rate limits', async () => {
      const policies: PolicyConfig[] = [
        {
          secretId: 'test',
          allowedActions: ['http_get'],
          allowedDomains: ['api.example.com'],
          rateLimit: { requests: 50, windowSeconds: 1800 }
        }
      ];

      mockReadFile.mockResolvedValue(JSON.stringify(policies));

      const result = await loader.loadPolicies();

      expect(result[0]?.rateLimit).toEqual({ requests: 50, windowSeconds: 1800 });
    });

    it('should propagate other errors', async () => {
      const error = new Error('Permission denied');
      mockReadFile.mockRejectedValue(error);

      await expect(loader.loadPolicies()).rejects.toThrow('Permission denied');
    });

    it('should use custom path when provided', async () => {
      const customLoader = new PolicyLoaderService('custom/path.json');
      mockReadFile.mockResolvedValue('[]');

      await customLoader.loadPolicies();

      expect(mockReadFile).toHaveBeenCalledWith('custom/path.json', 'utf-8');
    });

    it('should normalize actions to lowercase', async () => {
      const policies = [
        {
          secretId: 'test',
          allowedActions: ['HTTP_GET', 'Http_Post', 'HTTP_post'],
          allowedDomains: ['api.example.com']
        }
      ];

      mockReadFile.mockResolvedValue(JSON.stringify(policies));

      const result = await loader.loadPolicies();

      expect(result[0]?.allowedActions).toEqual(['http_get', 'http_post', 'http_post']);
    });

    it('should handle missing arrays gracefully', async () => {
      const policies = [
        {
          secretId: 'test',
          // Missing allowedActions and allowedDomains
        }
      ];

      mockReadFile.mockResolvedValue(JSON.stringify(policies));

      const result = await loader.loadPolicies();

      expect(result[0]?.allowedActions).toEqual([]);
      expect(result[0]?.allowedDomains).toEqual([]);
    });
  });
});