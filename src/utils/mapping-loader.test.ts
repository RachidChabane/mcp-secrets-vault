import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { MappingLoader } from './mapping-loader.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { ToolError } from './errors.js';

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
          { secretId: 'api-key', envVar: 'API_KEY' },
          { secretId: 'db-pass', envVar: 'DB_PASSWORD', description: 'Database password' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      const mappings = await loader.loadFromFile('mappings.json');
      
      expect(mappings).toHaveLength(2);
      expect(mappings[0]).toEqual({
        secretId: 'api-key',
        envVar: 'API_KEY'
      });
      expect(mappings[1]).toEqual({
        secretId: 'db-pass',
        envVar: 'DB_PASSWORD',
        description: 'Database password'
      });
    });

    it('should trim all string fields', async () => {
      const mockData = {
        mappings: [
          { secretId: '  api-key  ', envVar: '  API_KEY  ', description: '  Test  ' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      const mappings = await loader.loadFromFile('mappings.json');
      
      expect(mappings[0]).toEqual({
        secretId: 'api-key',
        envVar: 'API_KEY',
        description: 'Test'
      });
    });

    it('should throw ToolError for invalid JSON', async () => {
      vi.mocked(readFile).mockResolvedValue('invalid json{');

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(ToolError);
    });

    it('should throw ToolError for missing required fields', async () => {
      const mockData = {
        mappings: [
          { secretId: 'api-key' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(ToolError);
    });

    it('should throw ToolError for secretId too long', async () => {
      const mockData = {
        mappings: [
          { secretId: 'a'.repeat(CONFIG.MAX_SECRET_ID_LENGTH + 1), envVar: 'API_KEY' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(ToolError);
    });

    it('should throw ToolError for empty secretId', async () => {
      const mockData = {
        mappings: [
          { secretId: '', envVar: 'API_KEY' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(ToolError);
    });

    it('should throw ToolError for empty envVar', async () => {
      const mockData = {
        mappings: [
          { secretId: 'api-key', envVar: '' }
        ]
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      await expect(loader.loadFromFile('mappings.json'))
        .rejects.toThrow(ToolError);
    });

    it('should handle empty mappings array', async () => {
      const mockData = {
        mappings: []
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

      const mappings = await loader.loadFromFile('mappings.json');
      
      expect(mappings).toHaveLength(0);
    });

    it('should never expose sensitive error details', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT: /path/to/secret/file'));

      try {
        await loader.loadFromFile('mappings.json');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        if (error instanceof ToolError) {
          expect(error.message).toBe(TEXT.ERROR_INVALID_CONFIG);
          expect(error.message).not.toContain('/path/to/secret');
        }
      }
    });
  });

  describe('loadFromEnvironment', () => {
    it('should load mappings from environment variables', () => {
      process.env['MCP_VAULT_API_MAPPING'] = JSON.stringify({
        secretId: 'api-key',
        envVar: 'API_KEY'
      });
      process.env['MCP_VAULT_DB_MAPPING'] = JSON.stringify({
        secretId: 'db-pass',
        envVar: 'DB_PASSWORD',
        description: 'Database password'
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(2);
      expect(mappings).toContainEqual({
        secretId: 'api-key',
        envVar: 'API_KEY'
      });
      expect(mappings).toContainEqual({
        secretId: 'db-pass',
        envVar: 'DB_PASSWORD',
        description: 'Database password'
      });
    });

    it('should trim values from environment', () => {
      process.env['MCP_VAULT_TEST_MAPPING'] = JSON.stringify({
        secretId: '  test-key  ',
        envVar: '  TEST_KEY  ',
        description: '  Test  '
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings[0]).toEqual({
        secretId: 'test-key',
        envVar: 'TEST_KEY',
        description: 'Test'
      });
    });

    it('should ignore non-mapping environment variables', () => {
      process.env['MCP_VAULT_SOME_CONFIG'] = 'not a mapping';
      process.env['OTHER_VAR'] = 'ignored';
      process.env['MCP_VAULT_API_MAPPING'] = JSON.stringify({
        secretId: 'api-key',
        envVar: 'API_KEY'
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(1);
      expect(mappings[0]?.secretId).toBe('api-key');
    });

    it('should skip invalid JSON mappings', () => {
      process.env['MCP_VAULT_INVALID_MAPPING'] = 'not json';
      process.env['MCP_VAULT_VALID_MAPPING'] = JSON.stringify({
        secretId: 'api-key',
        envVar: 'API_KEY'
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(1);
      expect(mappings[0]?.secretId).toBe('api-key');
    });

    it('should skip mappings with invalid schema', () => {
      process.env['MCP_VAULT_INVALID_MAPPING'] = JSON.stringify({
        secretId: '',
        envVar: 'API_KEY'
      });
      process.env['MCP_VAULT_VALID_MAPPING'] = JSON.stringify({
        secretId: 'api-key',
        envVar: 'API_KEY'
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(1);
      expect(mappings[0]?.secretId).toBe('api-key');
    });

    it('should return empty array when no mappings found', () => {
      process.env['OTHER_VAR'] = 'not a mapping';
      
      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(0);
    });

    it('should handle empty mapping values', () => {
      process.env['MCP_VAULT_EMPTY_MAPPING'] = '';
      process.env['MCP_VAULT_WHITESPACE_MAPPING'] = '   ';
      process.env['MCP_VAULT_VALID_MAPPING'] = JSON.stringify({
        secretId: 'api-key',
        envVar: 'API_KEY'
      });

      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(1);
      expect(mappings[0]?.secretId).toBe('api-key');
    });
  });

  describe('security invariants', () => {
    it('should never expose actual secret values when loading', async () => {
      const mockData = {
        mappings: [
          { secretId: 'api-key', envVar: 'API_KEY' }
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
        .rejects.toThrow(ToolError);
    });

    it('should never expose ENV variable values in errors', () => {
      process.env['MCP_VAULT_TEST_MAPPING'] = 'this-should-not-appear-in-errors';
      
      const mappings = loader.loadFromEnvironment();
      
      expect(mappings).toHaveLength(0);
    });
  });
});