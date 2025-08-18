import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DiscoverTool } from './discover-tool.js';
import { SecretProvider, SecretInfo } from '../interfaces/secret-provider.interface.js';
import { TEXT } from '../constants/text-constants.js';

describe('DiscoverTool', () => {
  let mockSecretProvider: SecretProvider;
  let tool: DiscoverTool;

  beforeEach(() => {
    mockSecretProvider = {
      listSecretIds: vi.fn(),
      isSecretAvailable: vi.fn(),
      getSecretInfo: vi.fn()
    };
    tool = new DiscoverTool(mockSecretProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getTool', () => {
    it('should return tool definition with correct name and description', () => {
      const toolDef = tool.getTool();
      
      expect(toolDef.name).toBe(TEXT.TOOL_DISCOVER);
      expect(toolDef.description).toBe(TEXT.TOOL_DISCOVER_DESCRIPTION);
      expect(toolDef.inputSchema).toEqual({
        type: 'object',
        properties: {},
        required: []
      });
    });
  });

  describe('execute', () => {
    it('should return empty array when no secrets configured', async () => {
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue([]);
      
      const result = await tool.execute({});
      
      expect(result).toEqual({
        secrets: []
      });
      expect(mockSecretProvider.listSecretIds).toHaveBeenCalledTimes(1);
    });

    it('should return single secret info', async () => {
      const secretInfo: SecretInfo = {
        secretId: 'test_secret',
        available: true,
        description: 'Test secret'
      };
      
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue(['test_secret']);
      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue(secretInfo);
      
      const result = await tool.execute({});
      
      expect(result).toEqual({
        secrets: [secretInfo]
      });
      expect(mockSecretProvider.getSecretInfo).toHaveBeenCalledWith('test_secret');
    });

    it('should return multiple secrets info', async () => {
      const secret1: SecretInfo = {
        secretId: 'api_key',
        available: true,
        description: 'API Key'
      };
      const secret2: SecretInfo = {
        secretId: 'db_pass',
        available: false,
        description: 'Database password'
      };
      
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue(['api_key', 'db_pass']);
      vi.mocked(mockSecretProvider.getSecretInfo).mockImplementation((id) => {
        if (id === 'api_key') return secret1;
        if (id === 'db_pass') return secret2;
        return undefined;
      });
      
      const result = await tool.execute({});
      
      expect(result).toEqual({
        secrets: [secret1, secret2]
      });
      expect(mockSecretProvider.getSecretInfo).toHaveBeenCalledTimes(2);
    });

    it('should handle undefined args', async () => {
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue([]);
      
      const result = await tool.execute(undefined);
      
      expect(result).toEqual({
        secrets: []
      });
    });

    it('should handle null args', async () => {
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue([]);
      
      const result = await tool.execute(null);
      
      expect(result).toEqual({
        secrets: []
      });
    });

    it('should skip secrets with undefined info', async () => {
      const secretInfo: SecretInfo = {
        secretId: 'valid_secret',
        available: true
      };
      
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue(['valid_secret', 'invalid_secret']);
      vi.mocked(mockSecretProvider.getSecretInfo).mockImplementation((id) => {
        if (id === 'valid_secret') return secretInfo;
        return undefined;
      });
      
      const result = await tool.execute({});
      
      expect(result).toEqual({
        secrets: [secretInfo]
      });
    });

    it('should return immutable response', async () => {
      const secretInfo: SecretInfo = {
        secretId: 'test',
        available: true
      };
      
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue(['test']);
      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue(secretInfo);
      
      const result = await tool.execute({});
      
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.secrets)).toBe(true);
      expect(Object.isFrozen(result.secrets[0])).toBe(true);
    });

    it('should never expose envVar field', async () => {
      const internalInfo = {
        secretId: 'test',
        available: true,
        envVar: 'SECRET_ENV_VAR',
        description: 'Test'
      };
      
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue(['test']);
      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue(internalInfo as any);
      
      const result = await tool.execute({});
      
      expect(result.secrets[0]).not.toHaveProperty('envVar');
      expect(result.secrets[0]).toEqual({
        secretId: 'test',
        available: true,
        description: 'Test'
      });
    });

    it('should maintain deterministic output format', async () => {
      const secret1: SecretInfo = {
        secretId: 'first',
        available: true
      };
      const secret2: SecretInfo = {
        secretId: 'second',
        available: false,
        description: 'Second secret'
      };
      
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue(['first', 'second']);
      vi.mocked(mockSecretProvider.getSecretInfo)
        .mockImplementation((id) => {
          if (id === 'first') return secret1;
          if (id === 'second') return secret2;
          return undefined;
        });
      
      const result1 = await tool.execute({});
      const result2 = await tool.execute({});
      
      expect(result1).toEqual(result2);
    });

    it('should validate input schema', async () => {
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue([]);
      
      await expect(tool.execute({ unexpectedField: 'value' })).resolves.toEqual({
        secrets: []
      });
    });
  });

  describe('Security Invariants', () => {
    it('should never serialize secret values', async () => {
      const mockInfoWithSecretValue = {
        secretId: 'test',
        available: true,
        secretValue: 'actual-secret-value',
        description: 'Test'
      };
      
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue(['test']);
      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue(mockInfoWithSecretValue as any);
      
      const result = await tool.execute({});
      const serialized = JSON.stringify(result);
      
      expect(serialized).not.toContain('actual-secret-value');
      expect(serialized).not.toContain('secretValue');
    });

    it('should never expose ENV variable names', async () => {
      const mockInfoWithEnv = {
        secretId: 'test',
        available: true,
        envVar: 'MY_SECRET_ENV',
        envVarName: 'MY_SECRET_ENV',
        description: 'Test'
      };
      
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue(['test']);
      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue(mockInfoWithEnv as any);
      
      const result = await tool.execute({});
      const serialized = JSON.stringify(result);
      
      expect(serialized).not.toContain('MY_SECRET_ENV');
      expect(serialized).not.toContain('envVar');
      expect(serialized).not.toContain('envVarName');
    });
  });
});