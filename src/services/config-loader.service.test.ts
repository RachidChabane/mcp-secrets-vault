import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { ConfigLoaderService } from './config-loader.service.js';
import { CONFIG } from '../constants/config-constants.js';
import { ToolError } from '../utils/errors.js';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn()
  }
}));

describe('ConfigLoaderService', () => {
  let service: ConfigLoaderService;

  beforeEach(() => {
    service = new ConfigLoaderService('test-config.json');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadConfig', () => {
    it('should load and validate valid configuration', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [{
          secretId: 'test-secret',
          envVar: 'TEST_SECRET',
          description: 'Test secret'
        }],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: ['api.example.com']
        }]
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const config = await service.loadConfig();

      expect(config.version).toBe('1.0.0');
      expect(config.mappings).toHaveLength(1);
      expect(config.policies).toHaveLength(1);
      expect(fs.readFile).toHaveBeenCalledWith('test-config.json', CONFIG.DEFAULT_ENCODING);
    });

    it('should return cached config on subsequent calls', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [],
        policies: []
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const config1 = await service.loadConfig();
      const config2 = await service.loadConfig();

      expect(config1).toBe(config2); // Same reference
      expect(fs.readFile).toHaveBeenCalledTimes(1); // Only read once
    });

    it('should return deny-by-default config when file does not exist', async () => {
      const error: any = new Error('File not found');
      error.code = CONFIG.FS_ERROR_ENOENT;
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const config = await service.loadConfig();

      expect(config.version).toBe('1.0.0');
      expect(config.mappings).toEqual([]);
      expect(config.policies).toEqual([]);
      expect(config.settings).toBeUndefined();
    });

    it('should throw ToolError for invalid JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{ invalid json }');

      await expect(service.loadConfig()).rejects.toThrow(ToolError);
      await expect(service.loadConfig()).rejects.toThrow('Invalid JSON');
    });

    it('should throw ToolError for validation errors', async () => {
      const invalidConfig = {
        version: '2.0.0', // Invalid version
        mappings: [],
        policies: []
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(service.loadConfig()).rejects.toThrow(ToolError);
      await expect(service.loadConfig()).rejects.toThrow('Configuration validation failed');
    });

    it('should reject config with wildcard domains', async () => {
      const configWithWildcard = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test',
          allowedActions: ['http_get'],
          allowedDomains: ['*.example.com']
        }]
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(configWithWildcard));

      await expect(service.loadConfig()).rejects.toThrow('Wildcards not allowed');
    });

    it('should normalize and deduplicate domains', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [],
        policies: [{
          secretId: 'test',
          allowedActions: ['http_get', 'http_get'], // Duplicate
          allowedDomains: ['API.EXAMPLE.COM', 'api.example.com', 'www.example.com']
        }]
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const config = await service.loadConfig();
      const policy = config.policies[0];

      // Actions should be deduplicated and lowercase
      expect(policy?.allowedActions).toEqual(['http_get']);
      
      // Domains should be deduplicated, lowercase, and sorted
      expect(policy?.allowedDomains).toEqual(['api.example.com', 'www.example.com']);
    });

    it('should freeze configuration for immutability', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [{
          secretId: 'test',
          envVar: 'TEST'
        }],
        policies: [{
          secretId: 'test',
          allowedActions: ['http_get'],
          allowedDomains: ['example.com'],
          rateLimit: {
            requests: 100,
            windowSeconds: 60
          }
        }],
        settings: {
          auditDir: 'audit',
          defaultRateLimit: {
            requests: 50,
            windowSeconds: 30
          }
        }
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const config = await service.loadConfig();

      // Test immutability
      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.mappings)).toBe(true);
      expect(Object.isFrozen(config.mappings[0])).toBe(true);
      expect(Object.isFrozen(config.policies)).toBe(true);
      expect(Object.isFrozen(config.policies[0])).toBe(true);
      expect(Object.isFrozen(config.policies[0]?.allowedActions)).toBe(true);
      expect(Object.isFrozen(config.policies[0]?.allowedDomains)).toBe(true);
      expect(Object.isFrozen(config.policies[0]?.rateLimit)).toBe(true);
      expect(Object.isFrozen(config.settings)).toBe(true);
      expect(Object.isFrozen(config.settings?.defaultRateLimit)).toBe(true);
    });

    it('should trim whitespace from string fields', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [{
          secretId: 'test-secret',
          envVar: 'TEST_SECRET',
          description: '  Test description  '
        }],
        policies: [{
          secretId: 'test-secret',
          allowedActions: ['http_get'],
          allowedDomains: ['api.example.com'],
          expiresAt: '2025-12-31T23:59:59Z'
        }]
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const config = await service.loadConfig();

      // Only description is trimmed since others are validated by schema
      expect(config.mappings[0]?.secretId).toBe('test-secret');
      expect(config.mappings[0]?.envVar).toBe('TEST_SECRET');
      expect(config.mappings[0]?.description).toBe('Test description');
      expect(config.policies[0]?.secretId).toBe('test-secret');
      expect(config.policies[0]?.allowedDomains[0]).toBe('api.example.com');
      expect(config.policies[0]?.expiresAt).toBe('2025-12-31T23:59:59Z');
    });
  });

  describe('helper methods', () => {
    it('should return empty arrays before config is loaded', () => {
      expect(service.getMappings()).toEqual([]);
      expect(service.getPolicies()).toEqual([]);
      expect(service.getSettings()).toBeUndefined();
    });

    it('should return config parts after loading', async () => {
      const mockConfig = {
        version: '1.0.0',
        mappings: [{
          secretId: 'test',
          envVar: 'TEST'
        }],
        policies: [{
          secretId: 'test',
          allowedActions: ['http_get'],
          allowedDomains: ['example.com']
        }],
        settings: {
          auditDir: 'audit'
        }
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      await service.loadConfig();

      expect(service.getMappings()).toHaveLength(1);
      expect(service.getPolicies()).toHaveLength(1);
      expect(service.getSettings()).toBeDefined();
      expect(service.getSettings()?.auditDir).toBe('audit');
    });
  });

  describe('getConfigPath', () => {
    it('should return the config path', () => {
      expect(service.getConfigPath()).toBe('test-config.json');
    });

    it('should use default config file when not specified', () => {
      const defaultService = new ConfigLoaderService();
      expect(defaultService.getConfigPath()).toBe(CONFIG.DEFAULT_CONFIG_FILE);
    });
  });
});