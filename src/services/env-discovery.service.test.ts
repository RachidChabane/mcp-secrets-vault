import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnvDiscoveryService } from './env-discovery.service.js';

describe('EnvDiscoveryService', () => {
  let service: EnvDiscoveryService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    service = new EnvDiscoveryService();
    // Clear process.env and set test variables
    Object.keys(process.env).forEach(key => {
      delete process.env[key];
    });
  });

  afterEach(() => {
    // Restore original environment
    Object.keys(process.env).forEach(key => {
      delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
  });

  describe('discover', () => {
    it('should discover environment variables matching simple pattern', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      process.env.GITHUB_USER = 'testuser';
      process.env.OTHER_VAR = 'value';

      const result = service.discover({
        patterns: ['GITHUB_']
      });

      expect(result.discovered).toHaveLength(2);
      expect(result.discovered.map(m => m.envVar)).toContain('GITHUB_TOKEN');
      expect(result.discovered.map(m => m.envVar)).toContain('GITHUB_USER');
      expect(result.skipped).not.toContain('OTHER_VAR');
    });

    it('should discover multiple patterns', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      process.env.OPENAI_KEY = 'sk-test123';
      process.env.OTHER_VAR = 'value';

      const result = service.discover({
        patterns: ['GITHUB_', 'OPENAI_']
      });

      expect(result.discovered).toHaveLength(2);
      expect(result.discovered.map(m => m.envVar)).toContain('GITHUB_TOKEN');
      expect(result.discovered.map(m => m.envVar)).toContain('OPENAI_KEY');
    });

    it('should skip empty environment variables', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      process.env.GITHUB_EMPTY = '';
      process.env.GITHUB_WHITESPACE = '   ';

      const result = service.discover({
        patterns: ['GITHUB_']
      });

      expect(result.discovered).toHaveLength(1);
      expect(result.discovered[0].envVar).toBe('GITHUB_TOKEN');
      expect(result.skipped).toContain('GITHUB_EMPTY (empty value)');
    });

    it('should return empty result when no patterns provided', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';

      const result = service.discover({
        patterns: []
      });

      expect(result.discovered).toHaveLength(0);
      expect(result.warnings).toContain('No patterns provided for discovery');
    });

    it('should respect maxSecrets limit', () => {
      // Create 10 matching env vars
      for (let i = 1; i <= 10; i++) {
        process.env[`GITHUB_VAR_${i}`] = `value${i}`;
      }

      const result = service.discover({
        patterns: ['GITHUB_'],
        maxSecrets: 5
      });

      expect(result.discovered).toHaveLength(5);
      expect(result.warnings).toContain(
        'Discovery limit of 5 secrets reached. Consider increasing maxSecrets or using more specific patterns.'
      );
    });

    it('should create valid secretIds from env var names', () => {
      process.env['GITHUB-TOKEN'] = 'value';
      process.env['OPENAI.KEY'] = 'value';

      const result = service.discover({
        patterns: ['GITHUB', 'OPENAI']
      });

      expect(result.discovered.length).toBeGreaterThan(0);
      result.discovered.forEach(mapping => {
        // secretId should be lowercase and contain only alphanumeric, hyphens, underscores
        expect(mapping.secretId).toMatch(/^[a-z0-9_-]+$/);
      });
    });

    it('should handle comma-separated patterns in a single string', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      process.env.OPENAI_KEY = 'sk-test123';
      process.env.AWS_SECRET = 'secret123';

      const result = service.discover({
        patterns: ['GITHUB_,OPENAI_,AWS_']
      });

      expect(result.discovered).toHaveLength(3);
    });

    it('should normalize patterns to uppercase', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';

      const result = service.discover({
        patterns: ['github_']
      });

      expect(result.discovered).toHaveLength(1);
      expect(result.discovered[0].envVar).toBe('GITHUB_TOKEN');
    });

    it('should handle patterns with wildcard suffix', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      process.env.GITHUB_USER = 'testuser';

      const result = service.discover({
        patterns: ['GITHUB_*']
      });

      expect(result.discovered).toHaveLength(2);
    });

    it('should not match partial patterns', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';
      process.env.MY_GITHUB_KEY = 'key123';

      const result = service.discover({
        patterns: ['GITHUB_']
      });

      expect(result.discovered).toHaveLength(1);
      expect(result.discovered[0].envVar).toBe('GITHUB_TOKEN');
    });

    it('should include description in discovered mappings', () => {
      process.env.GITHUB_TOKEN = 'ghp_test123';

      const result = service.discover({
        patterns: ['GITHUB_']
      });

      expect(result.discovered[0].description).toBe('Auto-discovered from environment variable');
    });
  });

  describe('validatePatterns', () => {
    it('should reject bare wildcard', () => {
      expect(() => {
        service.validatePatterns(['*']);
      }).toThrow('patterns must be explicit');
    });

    it('should reject empty patterns', () => {
      expect(() => {
        service.validatePatterns(['']);
      }).toThrow('patterns must be explicit');
    });

    it('should reject overly broad patterns', () => {
      expect(() => {
        service.validatePatterns(['A_']);
      }).toThrow('too broad');
    });

    it('should accept valid patterns', () => {
      expect(() => {
        service.validatePatterns(['GITHUB_', 'OPENAI_', 'AWS_']);
      }).not.toThrow();
    });

    it('should accept patterns with trailing wildcard', () => {
      expect(() => {
        service.validatePatterns(['GITHUB_*', 'OPENAI_*']);
      }).not.toThrow();
    });
  });

  describe('normalizePatterns', () => {
    it('should convert patterns to uppercase', () => {
      const result = (service as any).normalizePatterns(['github_', 'openai_']);
      expect(result).toEqual(['GITHUB_', 'OPENAI_']);
    });

    it('should remove trailing asterisks', () => {
      const result = (service as any).normalizePatterns(['GITHUB_*', 'OPENAI_*']);
      expect(result).toEqual(['GITHUB_', 'OPENAI_']);
    });

    it('should split comma-separated patterns', () => {
      const result = (service as any).normalizePatterns(['GITHUB_,OPENAI_']);
      expect(result).toEqual(['GITHUB_', 'OPENAI_']);
    });

    it('should remove duplicates', () => {
      const result = (service as any).normalizePatterns(['GITHUB_', 'GITHUB_', 'OPENAI_']);
      expect(result).toEqual(['GITHUB_', 'OPENAI_']);
    });

    it('should filter out empty patterns', () => {
      const result = (service as any).normalizePatterns(['GITHUB_', '', 'OPENAI_']);
      expect(result).toEqual(['GITHUB_', 'OPENAI_']);
    });

    it('should filter out bare wildcards', () => {
      const result = (service as any).normalizePatterns(['GITHUB_', '*', 'OPENAI_']);
      expect(result).toEqual(['GITHUB_', 'OPENAI_']);
    });
  });

  describe('matchesPattern', () => {
    it('should match exact pattern', () => {
      const matches = (service as any).matchesPattern('GITHUB_', ['GITHUB_']);
      expect(matches).toBe(true);
    });

    it('should match prefix pattern', () => {
      const matches = (service as any).matchesPattern('GITHUB_TOKEN', ['GITHUB_']);
      expect(matches).toBe(true);
    });

    it('should not match non-matching pattern', () => {
      const matches = (service as any).matchesPattern('GITLAB_TOKEN', ['GITHUB_']);
      expect(matches).toBe(false);
    });

    it('should match multiple patterns', () => {
      const matches1 = (service as any).matchesPattern('GITHUB_TOKEN', ['GITHUB_', 'OPENAI_']);
      const matches2 = (service as any).matchesPattern('OPENAI_KEY', ['GITHUB_', 'OPENAI_']);
      expect(matches1).toBe(true);
      expect(matches2).toBe(true);
    });

    it('should be case-insensitive', () => {
      const matches = (service as any).matchesPattern('github_token', ['GITHUB_']);
      expect(matches).toBe(true);
    });
  });

  describe('sanitizeSecretId', () => {
    it('should convert to lowercase', () => {
      const result = (service as any).sanitizeSecretId('GITHUB_TOKEN');
      expect(result).toBe('github_token');
    });

    it('should replace special characters with underscores', () => {
      const result = (service as any).sanitizeSecretId('GITHUB-TOKEN.NAME');
      expect(result).toBe('github_token_name');
    });

    it('should remove leading and trailing underscores', () => {
      const result = (service as any).sanitizeSecretId('_GITHUB_TOKEN_');
      expect(result).toBe('github_token');
    });

    it('should collapse multiple underscores', () => {
      const result = (service as any).sanitizeSecretId('GITHUB__TOKEN');
      expect(result).toBe('github_token');
    });

    it('should handle complex names', () => {
      const result = (service as any).sanitizeSecretId('MY-GITHUB.TOKEN_NAME');
      expect(result).toBe('my_github_token_name');
    });
  });

  describe('edge cases', () => {
    it('should handle no environment variables', () => {
      const result = service.discover({
        patterns: ['GITHUB_']
      });

      expect(result.discovered).toHaveLength(0);
      expect(result.warnings).toEqual([]);
    });

    it('should handle special characters in env var values', () => {
      process.env.GITHUB_TOKEN = 'ghp_test@#$%^&*()123';

      const result = service.discover({
        patterns: ['GITHUB_']
      });

      expect(result.discovered).toHaveLength(1);
    });

    it('should handle very long env var values', () => {
      process.env.GITHUB_TOKEN = 'x'.repeat(10000);

      const result = service.discover({
        patterns: ['GITHUB_']
      });

      expect(result.discovered).toHaveLength(1);
    });

    it('should handle patterns with numbers', () => {
      process.env.API_KEY_V2 = 'test123';
      process.env.API_KEY_V3 = 'test456';

      const result = service.discover({
        patterns: ['API_KEY_']
      });

      expect(result.discovered).toHaveLength(2);
    });
  });
});
