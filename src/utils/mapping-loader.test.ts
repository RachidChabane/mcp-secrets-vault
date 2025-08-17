import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { MappingLoader } from './mapping-loader.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';

vi.mock('fs/promises');

describe('MappingLoader', () => {
  let loader: MappingLoader;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    loader = new MappingLoader();
    originalEnv = { ...process.env };
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('loadFromFile', () => {
    it('should load valid mappings from file', async () => {
      const mockData = {
        mappings: [
          { secretId: 'api_key', envVar: 'API_KEY' },
          { secretId: 'db_pass', envVar: 'DB_PASSWORD', description: 'Database password' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      const mappings = await loader.loadFromFile('mappings.json');
      
      expect(mappings).toHaveLength(2);
      expect(mappings[0]).toEqual({
        secretId: 'api_key',
        envVar: 'API_KEY'
      });
      expect(mappings[1]).toEqual({
        secretId: 'db_pass',
        envVar: 'DB_PASSWORD',
        description: 'Database password'
      });
    });

    it('should throw error for invalid JSON', async () => {
      vi.mocked(readFile).mockResolvedValue('invalid json{');

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(TEXT.ERROR_INVALID_CONFIG);
    });

    it('should throw error for missing required fields', async () => {
      const mockData = {
        mappings: [
          { secretId: 'api_key' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(TEXT.ERROR_INVALID_CONFIG);
    });

    it('should throw error for secretId too long', async () => {
      const mockData = {
        mappings: [
          { secretId: 'a'.repeat(101), envVar: 'API_KEY' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(TEXT.ERROR_INVALID_CONFIG);
    });

    it('should throw error for empty secretId', async () => {
      const mockData = {
        mappings: [
          { secretId: '', envVar: 'API_KEY' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(TEXT.ERROR_INVALID_CONFIG);
    });

    it('should throw error for empty envVar', async () => {
      const mockData = {
        mappings: [
          { secretId: 'api_key', envVar: '' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(TEXT.ERROR_INVALID_CONFIG);
    });

    it('should handle empty mappings array', async () => {
      const mockData = {
        mappings: []
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      const mappings = await loader.loadFromFile('mappings.json');
      
      expect(mappings).toHaveLength(0);
    });
  });

  describe('loadFromEnvironment', () => {
    it('should load mappings from environment variables', () => {
      process.env['MCP_VAULT_API_MAPPING'] = JSON.stringify({
        secretId: 'api_key',
        envVar: 'API_KEY'
      });
      process.env['MCP_VAULT_DB_MAPPING'] = JSON.stringify({
        secretId: 'db_pass',
        envVar: 'DB_PASSWORD',
        description: 'Database password'
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(2);
      expect(mappings).toContainEqual({
        secretId: 'api_key',
        envVar: 'API_KEY'
      });
      expect(mappings).toContainEqual({
        secretId: 'db_pass',
        envVar: 'DB_PASSWORD',
        description: 'Database password'
      });
    });

    it('should ignore non-mapping environment variables', () => {
      process.env['MCP_VAULT_SOME_CONFIG'] = 'not a mapping';
      process.env['OTHER_VAR'] = 'ignored';
      process.env['MCP_VAULT_API_MAPPING'] = JSON.stringify({
        secretId: 'api_key',
        envVar: 'API_KEY'
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(1);
      expect(mappings[0]?.secretId).toBe('api_key');
    });

    it('should skip invalid JSON mappings', () => {
      process.env['MCP_VAULT_INVALID_MAPPING'] = 'not json';
      process.env['MCP_VAULT_VALID_MAPPING'] = JSON.stringify({
        secretId: 'api_key',
        envVar: 'API_KEY'
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(1);
      expect(mappings[0]?.secretId).toBe('api_key');
    });

    it('should skip mappings with invalid schema', () => {
      process.env['MCP_VAULT_INVALID_MAPPING'] = JSON.stringify({
        secretId: '',
        envVar: 'API_KEY'
      });
      process.env['MCP_VAULT_VALID_MAPPING'] = JSON.stringify({
        secretId: 'api_key',
        envVar: 'API_KEY'
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(1);
      expect(mappings[0]?.secretId).toBe('api_key');
    });

    it('should return empty array when no mappings found', () => {
      process.env['OTHER_VAR'] = 'not a mapping';
      
      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(0);
    });

    it('should handle empty mapping values', () => {
      process.env['MCP_VAULT_EMPTY_MAPPING'] = '';
      process.env['MCP_VAULT_VALID_MAPPING'] = JSON.stringify({
        secretId: 'api_key',
        envVar: 'API_KEY'
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(1);
      expect(mappings[0]?.secretId).toBe('api_key');
    });
  });

  describe('security invariants', () => {
    it('should never expose actual secret values when loading', async () => {
      const mockData = {
        mappings: [
          { secretId: 'api_key', envVar: 'API_KEY' }
        ]
      };

      process.env['API_KEY'] = 'super-secret-value';
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      const mappings = await loader.loadFromFile('mappings.json');
      
      expect(JSON.stringify(mappings)).not.toContain('super-secret-value');
    });

    it('should validate secretId length to prevent overflow', async () => {
      const mockData = {
        mappings: [
          { 
            secretId: 'a'.repeat(CONFIG.MAX_SECRET_ID_LENGTH + 1), 
            envVar: 'API_KEY' 
          }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(TEXT.ERROR_INVALID_CONFIG);
    });
  });
});