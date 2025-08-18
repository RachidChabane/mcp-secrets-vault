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
        [TEXT.FIELD_SECRETS]: []
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
        [TEXT.FIELD_SECRETS]: [{
          [TEXT.FIELD_SECRET_ID]: 'test_secret',
          [TEXT.FIELD_AVAILABLE]: true,
          [TEXT.FIELD_DESCRIPTION]: 'Test secret'
        }]
      });
      expect(mockSecretProvider.getSecretInfo).toHaveBeenCalledWith('test_secret');
    });

    it('should return multiple secrets sorted case-insensitively', async () => {
      const secret1: SecretInfo = {
        secretId: 'Zebra_key',
        available: true,
        description: 'Zebra Key'
      };
      const secret2: SecretInfo = {
        secretId: 'alpha_pass',
        available: false,
        description: 'Alpha password'
      };
      
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue(['Zebra_key', 'alpha_pass']);
      vi.mocked(mockSecretProvider.getSecretInfo).mockImplementation((id) => {
        if (id === 'Zebra_key') return secret1;
        if (id === 'alpha_pass') return secret2;
        return undefined;
      });
      
      const result = await tool.execute({});
      
      expect(result).toEqual({
        [TEXT.FIELD_SECRETS]: [
          {
            [TEXT.FIELD_SECRET_ID]: 'alpha_pass',
            [TEXT.FIELD_AVAILABLE]: false,
            [TEXT.FIELD_DESCRIPTION]: 'Alpha password'
          },
          {
            [TEXT.FIELD_SECRET_ID]: 'Zebra_key',
            [TEXT.FIELD_AVAILABLE]: true,
            [TEXT.FIELD_DESCRIPTION]: 'Zebra Key'
          }
        ]
      });
      expect(mockSecretProvider.getSecretInfo).toHaveBeenCalledTimes(2);
    });

    it('should handle undefined args', async () => {
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue([]);
      
      const result = await tool.execute(undefined);
      
      expect(result).toEqual({
        [TEXT.FIELD_SECRETS]: []
      });
    });

    it('should handle null args', async () => {
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue([]);
      
      const result = await tool.execute(null);
      
      expect(result).toEqual({
        [TEXT.FIELD_SECRETS]: []
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
        [TEXT.FIELD_SECRETS]: [{
          [TEXT.FIELD_SECRET_ID]: 'valid_secret',
          [TEXT.FIELD_AVAILABLE]: true,
          [TEXT.FIELD_DESCRIPTION]: undefined
        }]
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
      expect(Object.isFrozen(result[TEXT.FIELD_SECRETS])).toBe(true);
      expect(Object.isFrozen(result[TEXT.FIELD_SECRETS]?.[0])).toBe(true);
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
      
      expect(result[TEXT.FIELD_SECRETS]?.[0]).not.toHaveProperty('envVar');
      expect(result[TEXT.FIELD_SECRETS]?.[0]).toEqual({
        [TEXT.FIELD_SECRET_ID]: 'test',
        [TEXT.FIELD_AVAILABLE]: true,
        [TEXT.FIELD_DESCRIPTION]: 'Test'
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
        [TEXT.FIELD_SECRETS]: []
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

  describe('Sorting Determinism', () => {
    it('should sort secrets case-insensitively by secretId', async () => {
      const secrets = [
        { secretId: 'ZEBRA', available: true },
        { secretId: 'apple', available: true },
        { secretId: 'Banana', available: true },
        { secretId: 'cherry', available: true },
        { secretId: 'APPLE2', available: true }
      ];
      
      vi.mocked(mockSecretProvider.listSecretIds).mockReturnValue(
        secrets.map(s => s.secretId)
      );
      vi.mocked(mockSecretProvider.getSecretInfo).mockImplementation((id) => {
        return secrets.find(s => s.secretId === id);
      });
      
      const result = await tool.execute({});
      const sortedIds = result[TEXT.FIELD_SECRETS]?.map((s: any) => s[TEXT.FIELD_SECRET_ID]) || [];
      
      expect(sortedIds).toEqual(['apple', 'APPLE2', 'Banana', 'cherry', 'ZEBRA']);
    });
  });
});