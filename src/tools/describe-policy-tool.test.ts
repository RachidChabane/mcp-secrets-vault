import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DescribePolicyTool } from './describe-policy-tool.js';
import { PolicyProvider, PolicyConfig } from '../interfaces/policy.interface.js';
import { TEXT } from '../constants/text-constants.js';
import { CONFIG } from '../constants/config-constants.js';
import { ToolError } from '../utils/errors.js';

describe('DescribePolicyTool', () => {
  let mockPolicyProvider: PolicyProvider;
  let tool: DescribePolicyTool;

  beforeEach(() => {
    mockPolicyProvider = {
      loadPolicies: vi.fn(),
      evaluate: vi.fn(),
      getPolicy: vi.fn(),
      hasPolicy: vi.fn()
    };
    tool = new DescribePolicyTool(mockPolicyProvider);
  });

  describe('getTool', () => {
    it('returns tool metadata with correct name and description', () => {
      const toolDef = tool.getTool();
      
      expect(toolDef.name).toBe(TEXT.TOOL_DESCRIBE);
      expect(toolDef.description).toBe(TEXT.TOOL_DESC_DESCRIBE);
      expect(toolDef.inputSchema).toEqual({
        [TEXT.SCHEMA_TYPE]: TEXT.SCHEMA_TYPE_OBJECT,
        [TEXT.SCHEMA_PROPERTIES]: {
          [TEXT.FIELD_SECRET_ID]: {
            [TEXT.SCHEMA_TYPE]: TEXT.SCHEMA_TYPE_STRING,
            [TEXT.FIELD_DESCRIPTION]: TEXT.INPUT_DESC_SECRET_ID
          }
        },
        [TEXT.SCHEMA_REQUIRED]: [TEXT.FIELD_SECRET_ID]
      });
    });
  });

  describe('execute', () => {
    it('returns complete policy with all fields when policy exists', async () => {
      const mockPolicy: PolicyConfig = {
        secretId: 'test_secret',
        allowedActions: ['http_get', 'http_post'],
        allowedDomains: ['api.example.com', 'app.example.com'],
        rateLimit: {
          requests: 100,
          windowSeconds: 3600
        },
        expiresAt: '2024-12-31T23:59:59Z'
      };
      
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(mockPolicy);
      
      const result = await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'test_secret' });
      
      expect(result).toEqual({
        [TEXT.FIELD_SECRET_ID]: 'test_secret',
        [TEXT.FIELD_ALLOWED_ACTIONS]: ['http_get', 'http_post'],
        [TEXT.FIELD_ALLOWED_DOMAINS]: ['api.example.com', 'app.example.com'],
        [TEXT.FIELD_RATE_LIMIT]: {
          [TEXT.FIELD_REQUESTS]: 100,
          [TEXT.FIELD_WINDOW_SECONDS]: 3600
        },
        [TEXT.FIELD_EXPIRES_AT]: '2024-12-31T23:59:59Z'
      });
      
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('returns policy without optional fields when not present', async () => {
      const mockPolicy: PolicyConfig = {
        secretId: 'minimal_secret',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com']
      };
      
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(mockPolicy);
      
      const result = await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'minimal_secret' });
      
      expect(result).toEqual({
        [TEXT.FIELD_SECRET_ID]: 'minimal_secret',
        [TEXT.FIELD_ALLOWED_ACTIONS]: ['http_get'],
        [TEXT.FIELD_ALLOWED_DOMAINS]: ['api.example.com']
      });
      
      expect(TEXT.FIELD_RATE_LIMIT in result).toBe(false);
      expect(TEXT.FIELD_EXPIRES_AT in result).toBe(false);
    });

    it('throws ToolError when policy does not exist', async () => {
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(undefined);
      
      await expect(tool.execute({ [TEXT.FIELD_SECRET_ID]: 'unknown_secret' }))
        .rejects.toThrow(ToolError);
      
      try {
        await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'unknown_secret' });
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        const toolError = error as ToolError;
        expect(toolError.code).toBe(CONFIG.ERROR_CODE_NO_POLICY);
        expect(toolError.message).toBe(TEXT.ERROR_POLICY_NOT_FOUND);
      }
    });

    it('validates and trims secretId input', async () => {
      const mockPolicy: PolicyConfig = {
        secretId: 'test_secret',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com']
      };
      
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(mockPolicy);
      
      const result = await tool.execute({ [TEXT.FIELD_SECRET_ID]: '  test_secret  ' });
      
      expect(vi.mocked(mockPolicyProvider.getPolicy)).toHaveBeenCalledWith('test_secret');
      expect(result[TEXT.FIELD_SECRET_ID]).toBe('test_secret');
    });

    describe('input validation errors', () => {
      it('throws ToolError for invalid secretId format', async () => {
        try {
          await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'invalid-format!' });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          const toolError = error as ToolError;
          expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
          expect(toolError.message).toBe(TEXT.ERROR_INVALID_REQUEST);
        }
      });

      it('throws ToolError for empty secretId', async () => {
        try {
          await tool.execute({ [TEXT.FIELD_SECRET_ID]: '' });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          const toolError = error as ToolError;
          expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
          expect(toolError.message).toBe(TEXT.ERROR_INVALID_REQUEST);
        }
      });

      it('throws ToolError for too long secretId', async () => {
        try {
          await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'a'.repeat(CONFIG.MAX_SECRET_ID_LENGTH + 1) });
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          const toolError = error as ToolError;
          expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
          expect(toolError.message).toBe(TEXT.ERROR_INVALID_REQUEST);
        }
      });

      it('throws ToolError for missing secretId', async () => {
        try {
          await tool.execute({});
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          const toolError = error as ToolError;
          expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
          expect(toolError.message).toBe(TEXT.ERROR_INVALID_REQUEST);
        }
      });

      it('throws ToolError for null input', async () => {
        try {
          await tool.execute(null);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          const toolError = error as ToolError;
          expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
          expect(toolError.message).toBe(TEXT.ERROR_INVALID_REQUEST);
        }
      });

      it('throws ToolError for undefined input', async () => {
        try {
          await tool.execute(undefined);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ToolError);
          const toolError = error as ToolError;
          expect(toolError.code).toBe(CONFIG.ERROR_CODE_INVALID_REQUEST);
          expect(toolError.message).toBe(TEXT.ERROR_INVALID_REQUEST);
        }
      });
    });

    it('ensures arrays in response are frozen', async () => {
      const mockPolicy: PolicyConfig = {
        secretId: 'test_secret',
        allowedActions: ['http_get', 'http_post'],
        allowedDomains: ['api.example.com']
      };
      
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(mockPolicy);
      
      const result = await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'test_secret' });
      
      expect(Object.isFrozen(result[TEXT.FIELD_ALLOWED_ACTIONS])).toBe(true);
      expect(Object.isFrozen(result[TEXT.FIELD_ALLOWED_DOMAINS])).toBe(true);
    });

    it('ensures rate limit object is frozen when present', async () => {
      const mockPolicy: PolicyConfig = {
        secretId: 'test_secret',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com'],
        rateLimit: {
          requests: 100,
          windowSeconds: 3600
        }
      };
      
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(mockPolicy);
      
      const result = await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'test_secret' });
      
      expect(Object.isFrozen(result[TEXT.FIELD_RATE_LIMIT])).toBe(true);
    });

    it('never exposes envVar field even if present in policy', async () => {
      const mockPolicy: any = {
        secretId: 'test_secret',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com'],
        envVar: 'SECRET_ENV_VAR' // This should never appear in output
      };
      
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(mockPolicy);
      
      const result = await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'test_secret' });
      
      expect('envVar' in result).toBe(false);
      expect(TEXT.FIELD_ENV_VAR in result).toBe(false);
      expect(JSON.stringify(result)).not.toContain('SECRET_ENV_VAR');
    });

    it('handles empty allowed arrays correctly', async () => {
      const mockPolicy: PolicyConfig = {
        secretId: 'test_secret',
        allowedActions: [],
        allowedDomains: []
      };
      
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(mockPolicy);
      
      const result = await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'test_secret' });
      
      expect(result[TEXT.FIELD_ALLOWED_ACTIONS]).toEqual([]);
      expect(result[TEXT.FIELD_ALLOWED_DOMAINS]).toEqual([]);
    });

    it('preserves original order of allowed actions and domains', async () => {
      const mockPolicy: PolicyConfig = {
        secretId: 'test_secret',
        allowedActions: ['http_post', 'http_get'],
        allowedDomains: ['zulu.example.com', 'alpha.example.com', 'mike.example.com']
      };
      
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(mockPolicy);
      
      const result = await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'test_secret' });
      
      expect(result[TEXT.FIELD_ALLOWED_ACTIONS]).toEqual(['http_post', 'http_get']);
      expect(result[TEXT.FIELD_ALLOWED_DOMAINS]).toEqual(['zulu.example.com', 'alpha.example.com', 'mike.example.com']);
    });
  });

  describe('security invariants', () => {
    it('never exposes secret values', async () => {
      const mockPolicy: PolicyConfig = {
        secretId: 'test_secret',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com']
      };
      
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(mockPolicy);
      
      const result = await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'test_secret' });
      const resultStr = JSON.stringify(result);
      
      expect(resultStr).not.toContain('envVar');
      expect(resultStr).not.toContain('ENV_');
      expect(resultStr).not.toContain('process.env');
    });

    it('response is immutable', async () => {
      const mockPolicy: PolicyConfig = {
        secretId: 'test_secret',
        allowedActions: ['http_get'],
        allowedDomains: ['api.example.com'],
        rateLimit: {
          requests: 100,
          windowSeconds: 3600
        }
      };
      
      vi.mocked(mockPolicyProvider.getPolicy).mockReturnValue(mockPolicy);
      
      const result = await tool.execute({ [TEXT.FIELD_SECRET_ID]: 'test_secret' });
      
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result[TEXT.FIELD_ALLOWED_ACTIONS])).toBe(true);
      expect(Object.isFrozen(result[TEXT.FIELD_ALLOWED_DOMAINS])).toBe(true);
      expect(Object.isFrozen(result[TEXT.FIELD_RATE_LIMIT])).toBe(true);
      
      // Attempt to modify should fail (frozen objects throw in strict mode)
      const mutableResult = result as any;
      expect(() => {
        mutableResult.newField = 'test';
      }).toThrow();
      expect(mutableResult.newField).toBeUndefined();
    });

    it('validation errors never expose input values', async () => {
      const secretValue = 'my-secret-value-12345!@#$%';
      
      try {
        await tool.execute({ [TEXT.FIELD_SECRET_ID]: secretValue });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolError);
        const errorJson = JSON.stringify(error);
        expect(errorJson).not.toContain(secretValue);
        expect(errorJson).not.toContain('12345');
      }
    });
  });
});