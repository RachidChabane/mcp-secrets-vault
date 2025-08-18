import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UseSecretTool } from './use-secret-tool.js';
import { SecretProvider } from '../interfaces/secret-provider.interface.js';
import { SecretAccessor } from '../interfaces/secret-accessor.interface.js';
import { PolicyProviderService } from '../services/policy-provider.service.js';
import type { IActionExecutor } from '../interfaces/action-executor.interface.js';
import { JsonlAuditService } from '../services/audit-service.js';
import type { AuditService } from '../interfaces/audit.interface.js';
import { TEXT } from '../constants/text-constants.js';

vi.mock('../services/audit-service.js');

describe('UseSecretTool', () => {
  let tool: UseSecretTool;
  let mockSecretProvider: SecretProvider & SecretAccessor;
  let mockPolicyProvider: PolicyProviderService;
  let mockActionExecutor: IActionExecutor;
  let mockAuditService: AuditService;

  beforeEach(() => {
    mockSecretProvider = {
      listSecretIds: vi.fn(),
      getSecretInfo: vi.fn(),
      isSecretAvailable: vi.fn(),
      getSecretValue: vi.fn()
    } as any;

    mockPolicyProvider = new PolicyProviderService();
    
    mockActionExecutor = {
      execute: vi.fn()
    };

    tool = new UseSecretTool(
      mockSecretProvider,
      mockPolicyProvider,
      mockActionExecutor
    );

    // Access mocked instances
    mockAuditService = (JsonlAuditService as any).mock.instances[0];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getTool', () => {
    it('should return tool definition with correct schema', () => {
      const toolDef = tool.getTool();
      
      expect(toolDef.name).toBe(TEXT.TOOL_USE);
      expect(toolDef.description).toBe(TEXT.TOOL_DESC_USE);
      expect(toolDef.inputSchema).toEqual({
        type: TEXT.SCHEMA_TYPE_OBJECT,
        properties: {
          secretId: {
            type: TEXT.SCHEMA_TYPE_STRING,
            description: 'The ID of the secret to use'
          },
          action: {
            type: TEXT.SCHEMA_TYPE_OBJECT,
            properties: {
              type: {
                type: TEXT.SCHEMA_TYPE_STRING,
                enum: [TEXT.HTTP_METHOD_GET, TEXT.HTTP_METHOD_POST],
                description: 'The type of action to perform'
              },
              url: {
                type: TEXT.SCHEMA_TYPE_STRING,
                description: 'The URL to make the request to'
              },
              headers: {
                type: TEXT.SCHEMA_TYPE_OBJECT,
                description: 'Optional headers for the request',
                additionalProperties: { type: TEXT.SCHEMA_TYPE_STRING }
              },
              body: {
                type: TEXT.SCHEMA_TYPE_STRING,
                description: 'Optional body for POST requests'
              }
            },
            required: ['type', 'url']
          }
        },
        required: ['secretId', 'action']
      });
    });
  });

  describe('execute', () => {
    it('should successfully execute allowed action', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test API key'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret-value-123');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      vi.mocked(mockActionExecutor.execute).mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({ data: 'test' })
      });

      const result = await tool.execute(args);

      expect(result).toEqual({
        success: true,
        result: {
          statusCode: 200,
          statusText: 'OK',
          headers: {},
          body: JSON.stringify({ data: 'test' })
        }
      });

      expect(mockPolicyProvider.evaluate).toHaveBeenCalledWith(
        'TEST_API_KEY',
        'http_get',
        'api.example.com'
      );

      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'api.example.com',
        timestamp: expect.any(String),
        outcome: 'success' as const,
        reason: ''
      });

      expect(mockActionExecutor.execute).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://api.example.com/data',
        headers: undefined,
        body: undefined,
        secretValue: 'secret-value-123',
        injectionType: 'bearer'
      });
    });

    it('should deny action when policy evaluator denies', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_post',
          url: 'https://forbidden.com/api',
          body: '{"data": "test"}'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test API key'
      });

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: false,
        message: TEXT.ERROR_FORBIDDEN_DOMAIN
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result).toEqual({
        success: false,
        error: TEXT.ERROR_FORBIDDEN_DOMAIN
      });

      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_post',
        domain: 'forbidden.com',
        timestamp: expect.any(String),
        outcome: 'denied' as const,
        reason: TEXT.ERROR_FORBIDDEN_DOMAIN
      });

      expect(mockActionExecutor.execute).not.toHaveBeenCalled();
    });

    it('should return error for unknown secret', async () => {
      const args = {
        secretId: 'UNKNOWN_SECRET',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue(undefined);

      const result = await tool.execute(args);

      expect(result).toEqual({
        success: false,
        error: TEXT.ERROR_UNKNOWN_SECRET
      });
    });

    it('should return error for unavailable secret', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: false,
        description: 'Test API key'
      });

      const result = await tool.execute(args);

      expect(result).toEqual({
        success: false,
        error: TEXT.ERROR_UNKNOWN_SECRET
      });
    });

    it('should return error for invalid arguments', async () => {
      const args = {
        secretId: 'TEST_API_KEY'
        // Missing action
      };

      const result = await tool.execute(args);

      expect(result).toEqual({
        success: false,
        error: TEXT.ERROR_INVALID_REQUEST
      });
    });

    it('should return error for invalid URL', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'not-a-valid-url'
        }
      };

      const result = await tool.execute(args);

      expect(result).toEqual({
        success: false,
        error: TEXT.ERROR_INVALID_REQUEST
      });
    });

    it('should handle POST request with headers and body', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_post',
          url: 'https://api.example.com/submit',
          headers: {
            'Content-Type': 'application/json',
            'X-Custom-Header': 'custom-value'
          },
          body: '{"key": "value"}'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test API key'
      });

      vi.mocked(mockSecretProvider.getSecretValue).mockReturnValue('secret-value-123');

      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      vi.mocked(mockActionExecutor.execute).mockResolvedValue({
        statusCode: 201,
        statusText: 'Created',
        headers: {},
        body: JSON.stringify({ success: true })
      });

      const result = await tool.execute(args);

      expect(result).toEqual({
        success: true,
        result: {
          statusCode: 201,
          statusText: 'Created',
          headers: {},
          body: JSON.stringify({ success: true })
        }
      });

      expect(mockActionExecutor.execute).toHaveBeenCalledWith({
        method: 'POST',
        url: 'https://api.example.com/submit',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value'
        },
        body: '{"key": "value"}',
        secretValue: 'secret-value-123',
        injectionType: 'bearer'
      });
    });

    it('should log audit entry even when policy evaluation fails', async () => {
      const args = {
        secretId: 'TEST_API_KEY',
        action: {
          type: 'http_get',
          url: 'https://api.example.com/data'
        }
      };

      vi.mocked(mockSecretProvider.getSecretInfo).mockReturnValue({
        secretId: 'TEST_API_KEY',
        available: true,
        description: 'Test API key'
      });

      const evaluationError = new Error('Policy evaluation failed');
      mockPolicyProvider.evaluate = vi.fn().mockImplementation(() => {
        throw evaluationError;
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.execute(args);

      expect(result).toEqual({
        success: false,
        error: TEXT.ERROR_TOOL_EXECUTION_FAILED
      });

      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_API_KEY',
        action: 'http_get',
        domain: 'api.example.com',
        timestamp: expect.any(String),
        outcome: 'error' as const,
        reason: 'Policy evaluation failed'
      });
    });
  });

  describe('requestSecretAccess', () => {
    it('should audit successful access request', async () => {
      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: true
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.requestSecretAccess(
        'TEST_SECRET',
        'http_get',
        'example.com'
      );

      expect(result).toEqual({ allowed: true, message: undefined });

      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_SECRET',
        action: 'http_get',
        domain: 'example.com',
        timestamp: expect.any(String),
        outcome: 'success' as const,
        reason: ''
      });
    });

    it('should audit denied access request', async () => {
      mockPolicyProvider.evaluate = vi.fn().mockReturnValue({
        allowed: false,
        message: TEXT.ERROR_FORBIDDEN_DOMAIN
      });

      mockAuditService.write = vi.fn().mockResolvedValue(undefined);

      const result = await tool.requestSecretAccess(
        'TEST_SECRET',
        'http_post',
        'forbidden.com'
      );

      expect(result).toEqual({ 
        allowed: false, 
        message: TEXT.ERROR_FORBIDDEN_DOMAIN 
      });

      expect(mockAuditService.write).toHaveBeenCalledWith({
        secretId: 'TEST_SECRET',
        action: 'http_post',
        domain: 'forbidden.com',
        timestamp: expect.any(String),
        outcome: 'denied' as const,
        reason: TEXT.ERROR_FORBIDDEN_DOMAIN
      });
    });
  });
});