import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecretDiscoveryService } from './secret-discovery.service.js';

describe('SecretDiscoveryService', () => {
  let service: SecretDiscoveryService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    service = new SecretDiscoveryService();
    // Clear and setup test environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('discoverSecrets', () => {
    it('should discover secrets matching single pattern', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      process.env.GITHUB_API_KEY = 'ghp_test456';
      process.env.OTHER_VAR = 'other';

      const discovered = service.discoverSecrets(['GITHUB_*']);

      expect(discovered).toHaveLength(2);
      expect(discovered[0].secretId).toBe('github_token');
      expect(discovered[0].envVar).toBe('GITHUB_TOKEN');
      expect(discovered[1].secretId).toBe('github_api_key');
      expect(discovered[1].envVar).toBe('GITHUB_API_KEY');
    });

    it('should discover secrets matching multiple patterns', () => {
      process.env.GITHUB_TOKEN = 'ghp_test';
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.STRIPE_KEY = 'sk_test';

      const discovered = service.discoverSecrets(['GITHUB_*', 'OPENAI_*', 'STRIPE_*']);

      expect(discovered).toHaveLength(3);
    });

    it('should throw error if no patterns provided', () => {
      expect(() => service.discoverSecrets([])).toThrow();
    });

    it('should throw error if wildcard-only pattern provided', () => {
      expect(() => service.discoverSecrets(['*'])).toThrow();
    });

    it('should skip empty environment variables', () => {
      process.env.GITHUB_TOKEN = 'ghp_test';
      process.env.GITHUB_EMPTY = '';

      const discovered = service.discoverSecrets(['GITHUB_*']);

      expect(discovered).toHaveLength(1);
      expect(discovered[0].envVar).toBe('GITHUB_TOKEN');
    });

    it('should not discover duplicate secrets', () => {
      process.env.TEST_VAR = 'value';

      const discovered = service.discoverSecrets(['TEST_*', 'TEST_VAR']);

      expect(discovered).toHaveLength(1);
    });

    it('should convert env var names to lowercase secret IDs', () => {
      process.env.MY_API_KEY = 'test';

      const discovered = service.discoverSecrets(['MY_*']);

      expect(discovered[0].secretId).toBe('my_api_key');
      expect(discovered[0].envVar).toBe('MY_API_KEY');
    });

    it('should include description for discovered secrets', () => {
      process.env.TEST_VAR = 'value';

      const discovered = service.discoverSecrets(['TEST_*']);

      expect(discovered[0].description).toBeDefined();
      expect(discovered[0].description).toContain('TEST_VAR');
    });

    it('should throw error if max secrets exceeded', () => {
      // Create 101 environment variables
      for (let i = 0; i < 101; i++) {
        process.env[`TEST_VAR_${i}`] = 'value';
      }

      expect(() => service.discoverSecrets(['TEST_*'])).toThrow();
    });
  });

  describe('generateConfig', () => {
    it('should generate valid configuration from mappings', () => {
      const mappings = [
        { secretId: 'github_token', envVar: 'GITHUB_TOKEN', description: 'GitHub API token' }
      ];

      const config = service.generateConfig(mappings);
      const parsed = JSON.parse(config);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.mappings).toHaveLength(1);
      expect(parsed.policies).toHaveLength(1);
      expect(parsed.settings).toBeDefined();
    });

    it('should include all mappings in config', () => {
      const mappings = [
        { secretId: 'github_token', envVar: 'GITHUB_TOKEN' },
        { secretId: 'openai_key', envVar: 'OPENAI_API_KEY' }
      ];

      const config = service.generateConfig(mappings);
      const parsed = JSON.parse(config);

      expect(parsed.mappings).toHaveLength(2);
      expect(parsed.policies).toHaveLength(2);
    });

    it('should generate policies with default rate limits', () => {
      const mappings = [
        { secretId: 'test_secret', envVar: 'TEST_SECRET' }
      ];

      const config = service.generateConfig(mappings);
      const parsed = JSON.parse(config);

      expect(parsed.policies[0].rateLimit).toBeDefined();
      expect(parsed.policies[0].rateLimit.requests).toBeGreaterThan(0);
      expect(parsed.policies[0].rateLimit.windowSeconds).toBeGreaterThan(0);
    });

    it('should generate policies with empty allowed domains', () => {
      const mappings = [
        { secretId: 'test_secret', envVar: 'TEST_SECRET' }
      ];

      const config = service.generateConfig(mappings);
      const parsed = JSON.parse(config);

      expect(parsed.policies[0].allowedDomains).toEqual([]);
    });

    it('should include default settings', () => {
      const mappings = [
        { secretId: 'test_secret', envVar: 'TEST_SECRET' }
      ];

      const config = service.generateConfig(mappings);
      const parsed = JSON.parse(config);

      expect(parsed.settings.auditDir).toBeDefined();
      expect(parsed.settings.maxFileSizeMb).toBeDefined();
      expect(parsed.settings.maxFileAgeDays).toBeDefined();
    });

    it('should generate valid JSON', () => {
      const mappings = [
        { secretId: 'test_secret', envVar: 'TEST_SECRET' }
      ];

      const config = service.generateConfig(mappings);

      expect(() => JSON.parse(config)).not.toThrow();
    });
  });
});
